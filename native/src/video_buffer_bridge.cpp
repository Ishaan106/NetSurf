/**
 * VIDEO RING BUFFER - N-API Bridge
 * 
 * Exposes ring buffer + encoder functions to JavaScript for:
 * - Start/stop recording to RAM buffer (H.264 NALs)
 * - Get status, duration, memory usage  
 * - Save buffer to MP4 (muxes NALs, no re-encode)
 */

#include "video_ring_buffer.h"
#include "ring_buffer_encoder.h"
#include <napi.h>
#include <fstream>
#include <Windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <iostream>

namespace VideoBuffer {

// Initialize the video ring buffer (default 60fps/2min)
Napi::Value RingBuffer_Init(const Napi::CallbackInfo& info) {
    VideoBuffer::Initialize();
    return Napi::Boolean::New(info.Env(), true);
}

// Initialize with configurable FPS and duration
// ringBufferInitWithConfig(fps: number, durationSeconds: number)
Napi::Value RingBuffer_InitWithConfig(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected (fps: number, durationSeconds: number)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    uint32_t fps = info[0].As<Napi::Number>().Uint32Value();
    uint32_t durationSeconds = info[1].As<Napi::Number>().Uint32Value();
    
    // Validate FPS (30 or 60 only)
    if (fps != 30 && fps != 60) fps = 60;
    // Validate duration (1-5 minutes = 60-300 seconds)
    if (durationSeconds < 60) durationSeconds = 60;
    if (durationSeconds > 300) durationSeconds = 300;
    
    VideoBuffer::InitializeWithConfig(fps, durationSeconds);
    return Napi::Boolean::New(env, true);
}

// Set encoder FPS
// ringBufferSetFps(fps: number)
Napi::Value RingBuffer_SetFps(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected (fps: number)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    int fps = info[0].As<Napi::Number>().Int32Value();
    RingBufferEncoder::SetFps(fps);
    return Napi::Boolean::New(env, true);
}

// Start recording to ring buffer (starts capture thread)
Napi::Value RingBuffer_StartRecording(const Napi::CallbackInfo& info) {
    bool success = RingBufferEncoder::Start();
    return Napi::Boolean::New(info.Env(), success);
}

// Stop recording to ring buffer (stops capture thread)
Napi::Value RingBuffer_StopRecording(const Napi::CallbackInfo& info) {
    RingBufferEncoder::Stop();
    return info.Env().Undefined();
}

// Clear ring buffer and free memory
Napi::Value RingBuffer_Clear(const Napi::CallbackInfo& info) {
    g_videoBuffer.clear();
    return info.Env().Undefined();
}

// Check if recording
Napi::Value RingBuffer_IsRecording(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), RingBufferEncoder::IsRecording());
}

// Get packet count
Napi::Value RingBuffer_GetPacketCount(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), VideoBuffer::GetPacketCount());
}

// Get buffer duration in milliseconds
Napi::Value RingBuffer_GetDurationMs(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), VideoBuffer::GetDurationMs());
}

// Get memory usage (actual bytes used by H.264 data)
Napi::Value RingBuffer_GetMemoryUsage(const Napi::CallbackInfo& info) {
    uint64_t bytes = VideoBuffer::GetMemoryUsage();
    return Napi::Number::New(info.Env(), static_cast<double>(bytes));
}

// Get buffer status as object
Napi::Value RingBuffer_GetStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    
    result.Set("recording", Napi::Boolean::New(env, RingBufferEncoder::IsRecording()));
    result.Set("packetCount", Napi::Number::New(env, VideoBuffer::GetPacketCount()));
    result.Set("durationMs", Napi::Number::New(env, VideoBuffer::GetDurationMs()));
    result.Set("memoryBytes", Napi::Number::New(env, static_cast<double>(VideoBuffer::GetMemoryUsage())));
    result.Set("frameCount", Napi::Number::New(env, static_cast<double>(RingBufferEncoder::GetFrameCount())));
    result.Set("recordingStartEpochMs", Napi::Number::New(env, static_cast<double>(RingBufferEncoder::GetRecordingStartEpochMs())));
    
    return result;
}

// ============ MINIMAL MP4 MUXER ============
// Write proper MP4 container with H.264 video track

// Helper to write big-endian 32-bit value
static void WriteBE32(std::vector<uint8_t>& buf, uint32_t val) {
    buf.push_back((val >> 24) & 0xFF);
    buf.push_back((val >> 16) & 0xFF);
    buf.push_back((val >> 8) & 0xFF);
    buf.push_back(val & 0xFF);
}

// Helper to write big-endian 16-bit value
static void WriteBE16(std::vector<uint8_t>& buf, uint16_t val) {
    buf.push_back((val >> 8) & 0xFF);
    buf.push_back(val & 0xFF);
}

// Helper to write 4-char code
static void WriteFourCC(std::vector<uint8_t>& buf, const char* code) {
    buf.push_back(code[0]);
    buf.push_back(code[1]);
    buf.push_back(code[2]);
    buf.push_back(code[3]);
}

// Convert Annex B NALs to AVCC format (replace start codes with length prefixes)
static std::vector<uint8_t> ConvertAnnexBToAVCC(const uint8_t* data, uint32_t size) {
    std::vector<uint8_t> result;
    result.reserve(size);
    
    size_t i = 0;
    while (i < size) {
        // Find start code (00 00 01 or 00 00 00 01)
        size_t startCodeLen = 0;
        if (i + 3 <= size && data[i] == 0 && data[i+1] == 0 && data[i+2] == 1) {
            startCodeLen = 3;
        } else if (i + 4 <= size && data[i] == 0 && data[i+1] == 0 && data[i+2] == 0 && data[i+3] == 1) {
            startCodeLen = 4;
        }
        
        if (startCodeLen > 0) {
            size_t nalStart = i + startCodeLen;
            // Find next start code or end
            size_t nalEnd = size;
            for (size_t j = nalStart; j < size - 3; j++) {
                if (data[j] == 0 && data[j+1] == 0 && (data[j+2] == 1 || (data[j+2] == 0 && j + 3 < size && data[j+3] == 1))) {
                    nalEnd = j;
                    break;
                }
            }
            
            // Write 4-byte length prefix + NAL data
            uint32_t nalLen = (uint32_t)(nalEnd - nalStart);
            WriteBE32(result, nalLen);
            result.insert(result.end(), data + nalStart, data + nalEnd);
            
            i = nalEnd;
        } else {
            i++;
        }
    }
    
    return result;
}

static bool MuxToMP4(const std::wstring& outputPath, uint32_t width, uint32_t height, int /* fps - unused, use real timestamps */) {
    uint32_t packetCount = g_videoBuffer.getCount();
    if (packetCount == 0) {
        std::cerr << "[VideoBuffer] No packets to mux" << std::endl;
        return false;
    }
    
    std::cout << "[VideoBuffer] Muxing " << packetCount << " packets to MP4..." << std::endl;
    
    // Get SPS/PPS from encoder
    const std::vector<uint8_t>& sps = RingBufferEncoder::GetSPS();
    const std::vector<uint8_t>& pps = RingBufferEncoder::GetPPS();
    
    if (sps.empty() || pps.empty()) {
        std::cerr << "[VideoBuffer] Missing SPS/PPS - cannot create valid MP4" << std::endl;
        return false;
    }
    
    std::cout << "[VideoBuffer] Using SPS (" << sps.size() << " bytes) and PPS (" << pps.size() << " bytes)" << std::endl;
    
    // Build AVCC decoder config
    std::vector<uint8_t> avccConfig;
    avccConfig.push_back(0x01);  // configurationVersion
    avccConfig.push_back(sps.size() > 1 ? sps[1] : 0x64);  // AVCProfileIndication
    avccConfig.push_back(sps.size() > 2 ? sps[2] : 0x00);  // profile_compatibility
    avccConfig.push_back(sps.size() > 3 ? sps[3] : 0x1F);  // AVCLevelIndication
    avccConfig.push_back(0xFF);  // lengthSizeMinusOne = 3 (4-byte lengths)
    avccConfig.push_back(0xE1);  // numOfSequenceParameterSets = 1
    WriteBE16(avccConfig, (uint16_t)sps.size());
    avccConfig.insert(avccConfig.end(), sps.begin(), sps.end());
    avccConfig.push_back(0x01);  // numOfPictureParameterSets = 1
    WriteBE16(avccConfig, (uint16_t)pps.size());
    avccConfig.insert(avccConfig.end(), pps.begin(), pps.end());
    
    // Convert all packets to AVCC format and build sample table
    std::vector<uint8_t> mdat;
    std::vector<uint32_t> sampleSizes;
    std::vector<uint32_t> sampleOffsets;
    std::vector<uint32_t> sampleDurations;  // Per-sample durations
    std::vector<uint32_t> keyframes;  // 1-based indices
    
    // Get timestamps for duration calculation
    int64_t baseTimestamp = g_videoBuffer.getStartTimestamp();
    std::vector<int64_t> timestamps;
    
    for (uint32_t i = 0; i < packetCount; i++) {
        const VideoPacket* packet = g_videoBuffer.getPacket(i);
        if (!packet || !packet->data || packet->size == 0) continue;
        
        std::vector<uint8_t> avccData = ConvertAnnexBToAVCC(packet->data.get(), packet->size);
        
        sampleOffsets.push_back((uint32_t)mdat.size());
        sampleSizes.push_back((uint32_t)avccData.size());
        mdat.insert(mdat.end(), avccData.begin(), avccData.end());
        
        // Store timestamp (normalized to start from 0, in 100ns units)
        timestamps.push_back(packet->timestamp_100ns - baseTimestamp);
        
        if (packet->isKeyframe()) {
            keyframes.push_back((uint32_t)sampleSizes.size());  // 1-based
        }
    }
    
    // Calculate per-sample durations from timestamps
    // Timescale: use 10000 (100us precision, matches 100ns / 10)
    uint32_t timescale = 10000;  // 10000 ticks per second
    
    for (size_t i = 0; i < timestamps.size(); i++) {
        uint32_t duration;
        if (i + 1 < timestamps.size()) {
            // Duration = next timestamp - current timestamp (convert 100ns to timescale)
            int64_t deltaNs = timestamps[i + 1] - timestamps[i];
            duration = (uint32_t)(deltaNs / 1000);  // 100ns to 10000Hz timescale
        } else {
            // Last frame - use average or default
            if (timestamps.size() > 1) {
                int64_t totalNs = timestamps.back() - timestamps.front();
                duration = (uint32_t)(totalNs / 1000 / (timestamps.size() - 1));
            } else {
                duration = timescale / 30;  // Default 30fps for single frame
            }
        }
        // Minimum duration of 1 tick
        if (duration < 1) duration = 1;
        sampleDurations.push_back(duration);
    }
    
    uint32_t sampleCount = (uint32_t)sampleSizes.size();
    
    // Calculate total duration from actual timestamps
    uint32_t totalDuration = 0;
    for (uint32_t d : sampleDurations) totalDuration += d;
    
    std::cout << "[VideoBuffer] Total duration: " << (totalDuration * 1000 / timescale) << " ms, " 
              << sampleCount << " frames" << std::endl;
    
    // Build moov box
    std::vector<uint8_t> moov;
    
    // mvhd (movie header)
    std::vector<uint8_t> mvhd;
    WriteBE32(mvhd, 0);  // version + flags
    WriteBE32(mvhd, 0);  // creation time
    WriteBE32(mvhd, 0);  // modification time
    WriteBE32(mvhd, timescale);  // timescale
    WriteBE32(mvhd, totalDuration);  // duration
    WriteBE32(mvhd, 0x00010000);  // rate = 1.0
    WriteBE16(mvhd, 0x0100);  // volume = 1.0
    for (int i = 0; i < 10; i++) mvhd.push_back(0);  // reserved
    // Matrix (identity)
    WriteBE32(mvhd, 0x00010000); WriteBE32(mvhd, 0); WriteBE32(mvhd, 0);
    WriteBE32(mvhd, 0); WriteBE32(mvhd, 0x00010000); WriteBE32(mvhd, 0);
    WriteBE32(mvhd, 0); WriteBE32(mvhd, 0); WriteBE32(mvhd, 0x40000000);
    for (int i = 0; i < 24; i++) mvhd.push_back(0);  // pre-defined
    WriteBE32(mvhd, 2);  // next track id
    
    // tkhd (track header)
    std::vector<uint8_t> tkhd;
    WriteBE32(tkhd, 0x00000003);  // version + flags (enabled + in movie)
    WriteBE32(tkhd, 0);  // creation time
    WriteBE32(tkhd, 0);  // modification time
    WriteBE32(tkhd, 1);  // track ID
    WriteBE32(tkhd, 0);  // reserved
    WriteBE32(tkhd, totalDuration);  // duration
    WriteBE32(tkhd, 0); WriteBE32(tkhd, 0);  // reserved
    WriteBE16(tkhd, 0);  // layer
    WriteBE16(tkhd, 0);  // alternate group
    WriteBE16(tkhd, 0);  // volume
    WriteBE16(tkhd, 0);  // reserved
    // Matrix
    WriteBE32(tkhd, 0x00010000); WriteBE32(tkhd, 0); WriteBE32(tkhd, 0);
    WriteBE32(tkhd, 0); WriteBE32(tkhd, 0x00010000); WriteBE32(tkhd, 0);
    WriteBE32(tkhd, 0); WriteBE32(tkhd, 0); WriteBE32(tkhd, 0x40000000);
    WriteBE32(tkhd, width << 16);  // width (16.16 fixed)
    WriteBE32(tkhd, height << 16);  // height (16.16 fixed)
    
    // mdhd (media header)
    std::vector<uint8_t> mdhd;
    WriteBE32(mdhd, 0);  // version + flags
    WriteBE32(mdhd, 0);  // creation time
    WriteBE32(mdhd, 0);  // modification time
    WriteBE32(mdhd, timescale);  // timescale
    WriteBE32(mdhd, totalDuration);  // duration
    WriteBE16(mdhd, 0x55C4);  // language (und)
    WriteBE16(mdhd, 0);  // pre-defined
    
    // hdlr (handler)
    std::vector<uint8_t> hdlr;
    WriteBE32(hdlr, 0);  // version + flags
    WriteBE32(hdlr, 0);  // pre-defined
    WriteFourCC(hdlr, "vide");  // handler type
    for (int i = 0; i < 12; i++) hdlr.push_back(0);  // reserved
    const char* name = "VideoHandler";
    for (int i = 0; name[i]; i++) hdlr.push_back(name[i]);
    hdlr.push_back(0);  // null terminator
    
    // vmhd (video media header)
    std::vector<uint8_t> vmhd;
    WriteBE32(vmhd, 0x00000001);  // version + flags
    WriteBE16(vmhd, 0);  // graphics mode
    WriteBE16(vmhd, 0); WriteBE16(vmhd, 0); WriteBE16(vmhd, 0);  // opcolor
    
    // dref (data reference)
    std::vector<uint8_t> dref;
    WriteBE32(dref, 0);  // version + flags
    WriteBE32(dref, 1);  // entry count
    WriteBE32(dref, 12);  // url box size
    WriteFourCC(dref, "url ");
    WriteBE32(dref, 0x00000001);  // flags = self-contained
    
    // avcC (AVC decoder config)
    std::vector<uint8_t> avcC;
    avcC.insert(avcC.end(), avccConfig.begin(), avccConfig.end());
    
    // stsd (sample description)
    std::vector<uint8_t> avc1;
    for (int i = 0; i < 6; i++) avc1.push_back(0);  // reserved
    WriteBE16(avc1, 1);  // data reference index
    for (int i = 0; i < 16; i++) avc1.push_back(0);  // pre-defined + reserved
    WriteBE16(avc1, width);
    WriteBE16(avc1, height);
    WriteBE32(avc1, 0x00480000);  // horiz resolution (72 dpi)
    WriteBE32(avc1, 0x00480000);  // vert resolution (72 dpi)
    WriteBE32(avc1, 0);  // reserved
    WriteBE16(avc1, 1);  // frame count
    for (int i = 0; i < 32; i++) avc1.push_back(0);  // compressor name
    WriteBE16(avc1, 0x0018);  // depth
    WriteBE16(avc1, 0xFFFF);  // pre-defined
    // avcC box
    WriteBE32(avc1, (uint32_t)(8 + avcC.size()));
    WriteFourCC(avc1, "avcC");
    avc1.insert(avc1.end(), avcC.begin(), avcC.end());
    
    std::vector<uint8_t> stsd;
    WriteBE32(stsd, 0);  // version + flags
    WriteBE32(stsd, 1);  // entry count
    WriteBE32(stsd, (uint32_t)(8 + avc1.size()));
    WriteFourCC(stsd, "avc1");
    stsd.insert(stsd.end(), avc1.begin(), avc1.end());
    
    // stts (time-to-sample) - use run-length encoding
    // Group consecutive samples with same duration
    std::vector<std::pair<uint32_t, uint32_t>> sttsEntries;  // count, duration
    if (!sampleDurations.empty()) {
        uint32_t currentDuration = sampleDurations[0];
        uint32_t count = 1;
        for (size_t i = 1; i < sampleDurations.size(); i++) {
            if (sampleDurations[i] == currentDuration) {
                count++;
            } else {
                sttsEntries.push_back({count, currentDuration});
                currentDuration = sampleDurations[i];
                count = 1;
            }
        }
        sttsEntries.push_back({count, currentDuration});
    }
    
    std::vector<uint8_t> stts;
    WriteBE32(stts, 0);  // version + flags
    WriteBE32(stts, (uint32_t)sttsEntries.size());  // entry count
    for (auto& entry : sttsEntries) {
        WriteBE32(stts, entry.first);   // sample count
        WriteBE32(stts, entry.second);  // sample duration
    }
    
    // stsc (sample-to-chunk)
    std::vector<uint8_t> stsc;
    WriteBE32(stsc, 0);  // version + flags
    WriteBE32(stsc, 1);  // entry count
    WriteBE32(stsc, 1);  // first chunk
    WriteBE32(stsc, sampleCount);  // samples per chunk
    WriteBE32(stsc, 1);  // sample description index
    
    // stsz (sample sizes)
    std::vector<uint8_t> stsz;
    WriteBE32(stsz, 0);  // version + flags
    WriteBE32(stsz, 0);  // sample size (0 = variable)
    WriteBE32(stsz, sampleCount);
    for (uint32_t sz : sampleSizes) WriteBE32(stsz, sz);
    
    // stco (chunk offsets) - will be filled with actual offset
    std::vector<uint8_t> stco;
    WriteBE32(stco, 0);  // version + flags
    WriteBE32(stco, 1);  // entry count
    WriteBE32(stco, 0);  // placeholder for mdat offset (will patch later)
    
    // stss (sync samples / keyframes)
    std::vector<uint8_t> stss;
    if (!keyframes.empty()) {
        WriteBE32(stss, 0);  // version + flags
        WriteBE32(stss, (uint32_t)keyframes.size());
        for (uint32_t kf : keyframes) WriteBE32(stss, kf);
    }
    
    // Build box hierarchy
    auto makeBox = [](const char* type, const std::vector<uint8_t>& content) {
        std::vector<uint8_t> box;
        WriteBE32(box, (uint32_t)(8 + content.size()));
        WriteFourCC(box, type);
        box.insert(box.end(), content.begin(), content.end());
        return box;
    };
    
    // dinf = dref
    std::vector<uint8_t> dinf = makeBox("dref", dref);
    dinf = makeBox("dinf", dinf);
    
    // stbl = stsd + stts + stsc + stsz + stco + stss
    std::vector<uint8_t> stbl;
    auto stsdBox = makeBox("stsd", stsd);
    auto sttsBox = makeBox("stts", stts);
    auto stscBox = makeBox("stsc", stsc);
    auto stszBox = makeBox("stsz", stsz);
    auto stcoBox = makeBox("stco", stco);
    stbl.insert(stbl.end(), stsdBox.begin(), stsdBox.end());
    stbl.insert(stbl.end(), sttsBox.begin(), sttsBox.end());
    stbl.insert(stbl.end(), stscBox.begin(), stscBox.end());
    stbl.insert(stbl.end(), stszBox.begin(), stszBox.end());
    stbl.insert(stbl.end(), stcoBox.begin(), stcoBox.end());
    if (!stss.empty()) {
        auto stssBox = makeBox("stss", stss);
        stbl.insert(stbl.end(), stssBox.begin(), stssBox.end());
    }
    stbl = makeBox("stbl", stbl);
    
    // minf = vmhd + dinf + stbl
    std::vector<uint8_t> minf;
    auto vmhdBox = makeBox("vmhd", vmhd);
    minf.insert(minf.end(), vmhdBox.begin(), vmhdBox.end());
    minf.insert(minf.end(), dinf.begin(), dinf.end());
    minf.insert(minf.end(), stbl.begin(), stbl.end());
    minf = makeBox("minf", minf);
    
    // mdia = mdhd + hdlr + minf
    std::vector<uint8_t> mdia;
    auto mdhdBox = makeBox("mdhd", mdhd);
    auto hdlrBox = makeBox("hdlr", hdlr);
    mdia.insert(mdia.end(), mdhdBox.begin(), mdhdBox.end());
    mdia.insert(mdia.end(), hdlrBox.begin(), hdlrBox.end());
    mdia.insert(mdia.end(), minf.begin(), minf.end());
    mdia = makeBox("mdia", mdia);
    
    // trak = tkhd + mdia
    std::vector<uint8_t> trak;
    auto tkhdBox = makeBox("tkhd", tkhd);
    trak.insert(trak.end(), tkhdBox.begin(), tkhdBox.end());
    trak.insert(trak.end(), mdia.begin(), mdia.end());
    trak = makeBox("trak", trak);
    
    // moov = mvhd + trak
    auto mvhdBox = makeBox("mvhd", mvhd);
    moov.insert(moov.end(), mvhdBox.begin(), mvhdBox.end());
    moov.insert(moov.end(), trak.begin(), trak.end());
    moov = makeBox("moov", moov);
    
    // ftyp box
    std::vector<uint8_t> ftyp;
    WriteFourCC(ftyp, "isom");  // major brand
    WriteBE32(ftyp, 0x200);     // minor version
    WriteFourCC(ftyp, "isom");  // compatible brands
    WriteFourCC(ftyp, "iso2");
    WriteFourCC(ftyp, "avc1");
    WriteFourCC(ftyp, "mp41");
    ftyp = makeBox("ftyp", ftyp);
    
    // mdat box
    std::vector<uint8_t> mdatHeader;
    WriteBE32(mdatHeader, (uint32_t)(8 + mdat.size()));
    WriteFourCC(mdatHeader, "mdat");
    
    // Calculate actual mdat data offset and patch stco
    uint32_t mdatDataOffset = (uint32_t)(ftyp.size() + moov.size() + 8);  // ftyp + moov + mdat header
    
    // Find stco offset in moov and patch it
    // stco is near the end of moov, search for "stco" and patch the offset after it
    for (size_t i = 0; i < moov.size() - 16; i++) {
        if (moov[i] == 's' && moov[i+1] == 't' && moov[i+2] == 'c' && moov[i+3] == 'o') {
            // Found stco, offset is at i+12 (after size, type, version, entry_count)
            size_t offsetPos = i + 12;
            moov[offsetPos] = (mdatDataOffset >> 24) & 0xFF;
            moov[offsetPos+1] = (mdatDataOffset >> 16) & 0xFF;
            moov[offsetPos+2] = (mdatDataOffset >> 8) & 0xFF;
            moov[offsetPos+3] = mdatDataOffset & 0xFF;
            break;
        }
    }
    
    // Write file
    HANDLE hFile = CreateFileW(outputPath.c_str(), GENERIC_WRITE, 0, nullptr,
                                CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (hFile == INVALID_HANDLE_VALUE) {
        std::cerr << "[VideoBuffer] Failed to create output file" << std::endl;
        return false;
    }
    
    DWORD written;
    WriteFile(hFile, ftyp.data(), (DWORD)ftyp.size(), &written, nullptr);
    WriteFile(hFile, moov.data(), (DWORD)moov.size(), &written, nullptr);
    WriteFile(hFile, mdatHeader.data(), (DWORD)mdatHeader.size(), &written, nullptr);
    WriteFile(hFile, mdat.data(), (DWORD)mdat.size(), &written, nullptr);
    
    CloseHandle(hFile);
    
    uint64_t totalBytes = ftyp.size() + moov.size() + 8 + mdat.size();
    std::cout << "[VideoBuffer] Wrote MP4: " << sampleCount << " frames, " 
              << (totalBytes / 1024) << " KB" << std::endl;
    
    return true;
}

// Save ring buffer - mux H.264 NALs to MP4
Napi::Value RingBuffer_Save(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::Object result = Napi::Object::New(env);
        result.Set("success", Napi::Boolean::New(env, false));
        result.Set("error", Napi::String::New(env, "Missing output path"));
        return result;
    }
    
    std::string outputPath = info[0].As<Napi::String>().Utf8Value();
    std::wstring wOutputPath(outputPath.begin(), outputPath.end());
    
    // Get dimensions and FPS from encoder
    uint32_t width = RingBufferEncoder::GetWidth();
    uint32_t height = RingBufferEncoder::GetHeight();
    int fps = RingBufferEncoder::GetFps();
    
    std::cout << "[VideoBuffer] Saving " << width << "x" << height << " @ " << fps << " fps" << std::endl;
    
    // Stop recording if still running
    if (RingBufferEncoder::IsRecording()) {
        RingBufferEncoder::Stop();
    }
    
    uint32_t packetCount = g_videoBuffer.getCount();
    
    if (packetCount == 0) {
        Napi::Object result = Napi::Object::New(env);
        result.Set("success", Napi::Boolean::New(env, false));
        result.Set("error", Napi::String::New(env, "No packets in buffer"));
        return result;
    }
    
    // Mux H.264 NALs to MP4
    bool success = MuxToMP4(wOutputPath, width, height, fps);
    
    if (!success) {
        Napi::Object result = Napi::Object::New(env);
        result.Set("success", Napi::Boolean::New(env, false));
        result.Set("error", Napi::String::New(env, "Failed to mux to MP4"));
        return result;
    }
    
    // Get file size
    WIN32_FILE_ATTRIBUTE_DATA fileInfo;
    uint64_t bytesWritten = 0;
    if (GetFileAttributesExW(wOutputPath.c_str(), GetFileExInfoStandard, &fileInfo)) {
        LARGE_INTEGER size;
        size.HighPart = fileInfo.nFileSizeHigh;
        size.LowPart = fileInfo.nFileSizeLow;
        bytesWritten = size.QuadPart;
    }
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("success", Napi::Boolean::New(env, true));
    result.Set("packetCount", Napi::Number::New(env, packetCount));
    result.Set("durationMs", Napi::Number::New(env, g_videoBuffer.getDurationMs()));
    result.Set("bytesWritten", Napi::Number::New(env, static_cast<double>(bytesWritten)));
    result.Set("outputPath", Napi::String::New(env, outputPath));
    
    return result;
}

} // namespace VideoBuffer
