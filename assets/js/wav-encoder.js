/* WAV encoder — converts an AudioBuffer into a 16-bit PCM WAV Blob.
   Shared by the audio tools (trimmer, speed/pitch, joiner). */
"use strict";

(function (global) {

  function encodeWav(buffer) {
    var numChannels = buffer.numberOfChannels;
    var sampleRate = buffer.sampleRate;
    var numFrames = buffer.length;
    var bytesPerSample = 2;
    var blockAlign = numChannels * bytesPerSample;
    var dataSize = numFrames * blockAlign;
    var arrayBuffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(arrayBuffer);

    function writeString(offset, str) {
      for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);        /* PCM chunk size */
    view.setUint16(20, 1, true);         /* PCM format */
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);        /* bits per sample */
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    var channels = [];
    for (var c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

    var offset = 44;
    for (var i = 0; i < numFrames; i++) {
      for (var ch = 0; ch < numChannels; ch++) {
        var sample = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([view], { type: "audio/wav" });
  }

  global.encodeWav = encodeWav;

})(window);
