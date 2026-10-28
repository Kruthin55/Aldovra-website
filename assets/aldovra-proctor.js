/* Aldovra snapshot proctoring.
   Instead of full camera/screen videos (~80 MB per exam), we keep:
     - a small camera photo + a screen screenshot every 20 seconds
     - an extra pair on every suspicious event (tab switch, fullscreen exit, ...)
     - a low-bitrate audio track (Opus, 16 kbps)
     - timeline.json listing every snapshot with its time and reason
   About 6–8 MB for a 20-minute exam. Snapshots upload during the exam, so a crash loses little.
   Usage: AldovraProctor.start({db, bucket, userId, sessionId, cameraStream, screenStream})
          AldovraProctor.event("tab_hidden")      // extra snapshot, rate limited
          await AldovraProctor.stop()             // -> {camera_path:null, screen_path:null, audio_path, timeline_path, snapshot_count}
*/
(function (global) {
  "use strict";
  var INTERVAL_MS = 20000, EVENT_GAP_MS = 4000, MAX_SNAPS = 500;
  var CAM_W = 320, SCREEN_W = 960, CAM_Q = 0.6, SCREEN_Q = 0.45, AUDIO_BPS = 16000;
  var st = null;

  function mkVideo(stream) {
    var v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.autoplay = true; v.srcObject = stream;
    v.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.appendChild(v);
    var p = v.play(); if (p && p.catch) p.catch(function () {});
    return v;
  }
  function liveVideo(stream) {
    return !!(stream && stream.getVideoTracks().some(function (t) { return t.readyState === "live"; }));
  }
  function grab(video, maxW, quality) {
    return new Promise(function (resolve) {
      try {
        var w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) return resolve(null);
        var scale = Math.min(1, maxW / w), cw = Math.round(w * scale), ch = Math.round(h * scale);
        var c = document.createElement("canvas"); c.width = cw; c.height = ch;
        c.getContext("2d").drawImage(video, 0, 0, cw, ch);
        c.toBlob(function (b) { resolve(b); }, "image/jpeg", quality);
      } catch (e) { resolve(null); }
    });
  }
  function upload(path, blob, type) {
    var tries = 0;
    function go() {
      tries++;
      return st.db.storage.from(st.bucket).upload(path, blob, { contentType: type, upsert: true }).then(function (r) {
        if (r.error) throw r.error;
        st.bytes += blob.size || 0;
        return path;
      }).catch(function (e) {
        if (tries < 3) return new Promise(function (ok) { setTimeout(ok, 1500 * tries); }).then(go);
        st.failed++; console.warn("Proctor upload failed:", path, e && e.message);
        return null;
      });
    }
    return go();
  }
  // Uploads run one after another so a slow network never stacks hundreds of requests.
  function enqueue(task) {
    st.queue = st.queue.then(task, task);
    return st.queue;
  }
  function snap(reason) {
    if (!st || st.stopped || st.items.length >= MAX_SNAPS) return Promise.resolve();
    var seq = ++st.seq, t = new Date().toISOString(), pad = String(seq).padStart(4, "0");
    var jobs = [];
    if (st.camVideo && liveVideo(st.cameraStream)) jobs.push(grab(st.camVideo, CAM_W, CAM_Q).then(function (b) { return b && { kind: "camera", blob: b }; }));
    if (st.scrVideo && liveVideo(st.screenStream)) jobs.push(grab(st.scrVideo, SCREEN_W, SCREEN_Q).then(function (b) { return b && { kind: "screen", blob: b }; }));
    return Promise.all(jobs).then(function (shots) {
      shots.filter(Boolean).forEach(function (s) {
        var path = st.base + "/snaps/" + pad + "-" + s.kind + ".jpg";
        var item = { seq: seq, t: t, kind: s.kind, path: path, reason: reason || "interval", size: s.blob.size };
        enqueue(function () { return upload(path, s.blob, "image/jpeg").then(function (p) { if (p) st.items.push(item); }); });
      });
      if (!shots.some(Boolean) && reason !== "interval") st.missed.push({ t: t, reason: reason });
    });
  }

  function start(o) {
    st = {
      db: o.db, bucket: o.bucket || "assessment-evidence",
      base: o.userId + "/" + o.sessionId,
      cameraStream: o.cameraStream || null, screenStream: o.screenStream || null,
      items: [], missed: [], seq: 0, bytes: 0, failed: 0, queue: Promise.resolve(),
      startedAt: new Date().toISOString(), lastEventAt: 0, stopped: false, audioChunks: [], recorder: null
    };
    if (st.cameraStream) st.camVideo = mkVideo(st.cameraStream);
    if (st.screenStream) st.scrVideo = mkVideo(st.screenStream);

    // Audio only, low bitrate.
    try {
      var tracks = (st.cameraStream ? st.cameraStream.getAudioTracks() : []);
      if (tracks.length && global.MediaRecorder) {
        var mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0] || "";
        var rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, audioBitsPerSecond: AUDIO_BPS } : { audioBitsPerSecond: AUDIO_BPS });
        rec.ondataavailable = function (e) { if (e.data && e.data.size) st.audioChunks.push(e.data); };
        rec.start(5000);
        st.recorder = rec;
      }
    } catch (e) { console.warn("Audio recorder unavailable:", e && e.message); }

    setTimeout(function () { snap("start"); }, 1500);
    st.interval = Math.max(2000, Number(o.intervalMs) || INTERVAL_MS);
    st.timer = setInterval(function () { snap("interval"); }, st.interval);
  }

  function event(type) {
    if (!st || st.stopped) return;
    var now = Date.now();
    if (now - st.lastEventAt < EVENT_GAP_MS) return;
    st.lastEventAt = now;
    snap(type);
  }

  function stopRecorder(rec) {
    return new Promise(function (resolve) {
      if (!rec || rec.state === "inactive") return resolve();
      rec.addEventListener("stop", function () { resolve(); }, { once: true });
      try { rec.stop(); } catch (e) { resolve(); }
      setTimeout(resolve, 3000);
    });
  }

  function stop(extra) {
    if (!st) return Promise.resolve({ camera_path: null, screen_path: null });
    var s = st;
    return snap("end").then(function () {
      s.stopped = true;
      clearInterval(s.timer);
      return stopRecorder(s.recorder);
    }).then(function () {
      var audioUpload = Promise.resolve(null);
      if (s.audioChunks.length) {
        var type = (s.audioChunks[0].type || "audio/webm").split(";")[0];
        var blob = new Blob(s.audioChunks, { type: type });
        audioUpload = enqueue(function () { return upload(s.base + "/audio.webm", blob, type); });
      }
      return audioUpload.then(function (audioPath) {
        // Wait for every queued snapshot (max 60 s) before writing the manifest.
        return Promise.race([s.queue, new Promise(function (ok) { setTimeout(ok, 60000); })]).then(function () { return audioPath; });
      });
    }).then(function (audioPath) {
      s.items.sort(function (a, b) { return a.seq - b.seq || (a.kind < b.kind ? -1 : 1); });
      var manifest = {
        version: 1, interval_seconds: s.interval / 1000,
        started_at: s.startedAt, ended_at: new Date().toISOString(),
        audio_path: audioPath || null,
        snapshots: s.items, missed: s.missed, upload_failures: s.failed,
        events: (extra && extra.events) || []
      };
      var mblob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
      return upload(s.base + "/timeline.json", mblob, "application/json").then(function (timelinePath) {
        [s.camVideo, s.scrVideo].forEach(function (v) { if (v) { v.srcObject = null; v.remove(); } });
        st = null;
        return {
          camera_path: null, screen_path: null,
          audio_path: audioPath || null,
          timeline_path: timelinePath || null,
          snapshot_count: s.items.length,
          bytes: s.bytes
        };
      });
    });
  }

  global.AldovraProctor = { start: start, event: event, stop: stop, snap: snap };
})(window);
