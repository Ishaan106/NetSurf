/**
 * MP4 MUXER - Implementation
 * 
 * Muxes H.264 NAL units from the ring buffer directly into MP4 container.
 * NO RE-ENCODING - just repackaging the already-encoded H.264 data.
 * 
 * Uses Media Foundation Sink Writer in pass-through mode.
 */

#include "mp4_muxer.h"
#include "video_ring_buffer.h"
#include "ring_buffer_encoder.h"
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <mferror.h>
#include <iostream>

namespace MP4Muxer {

static std::string g_lastError;

const std::string& GetLastError() {
    return g_lastError;
}

bool SaveRingBufferToMP4(const std::wstring& outputPath) {
    // Save full buffer duration
    return SaveRingBufferToMP4(outputPath, VideoBuffer::GetDurationMs());
}

bool SaveRingBufferToMP4(const std::wstring& outputPath, uint32_t durationMs) {
    // Check if we have data
    uint32_t packetCount = VideoBuffer::GetPacketCount();
    if (packetCount == 0) {
        g_lastError = "Ring buffer is empty";
        std::cerr << "[MP4Muxer] " << g_lastError << std::endl;
        return false;
    }
    
    // Check if we have SPS/PPS headers
    if (!RingBufferEncoder::HasHeaders()) {
        g_lastError = "No SPS/PPS headers available";
        std::cerr << "[MP4Muxer] " << g_lastError << std::endl;
        return false;
    }
    
    const std::vector<uint8_t>& sps = RingBufferEncoder::GetSPS();
    const std::vector<uint8_t>& pps = RingBufferEncoder::GetPPS();
    
    std::cout << "[MP4Muxer] Saving " << packetCount << " packets to: ";
    std::wcout << outputPath << std::endl;
    
    // Initialize Media Foundation
    HRESULT hr = MFStartup(MF_VERSION);
    if (FAILED(hr)) {
        g_lastError = "MFStartup failed";
        return false;
    }
    
    // Create sink writer attributes
    IMFAttributes* attrs = nullptr;
    hr = MFCreateAttributes(&attrs, 2);
    if (FAILED(hr)) {
        MFShutdown();
        g_lastError = "MFCreateAttributes failed";
        return false;
    }
    
    // Disable automatic transcoding - we want pass-through
    attrs->SetUINT32(MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, FALSE);
    attrs->SetUINT32(MF_LOW_LATENCY, TRUE);
    
    // Create sink writer
    IMFSinkWriter* sinkWriter = nullptr;
    hr = MFCreateSinkWriterFromURL(outputPath.c_str(), nullptr, attrs, &sinkWriter);
    attrs->Release();
    
    if (FAILED(hr)) {
        MFShutdown();
        g_lastError = "Failed to create sink writer: " + std::to_string(hr);
        std::cerr << "[MP4Muxer] " << g_lastError << std::endl;
        return false;
    }
    
    // Get first packet to determine video dimensions
    const VideoBuffer::VideoPacket* firstPacket = VideoBuffer::g_videoBuffer.getPacket(0);
    if (!firstPacket) {
        sinkWriter->Release();
        MFShutdown();
        g_lastError = "Failed to get first packet";
        return false;
    }
    
    // Get actual dimensions from encoder (matches capture resolution)
    UINT32 width = RingBufferEncoder::GetWidth();
    UINT32 height = RingBufferEncoder::GetHeight();
    
    // Fallback if not available
    if (width == 0 || height == 0) {
        width = 1920;
        height = 1080;
        std::cerr << "[MP4Muxer] Warning: Could not get encoder dimensions, using fallback 1920x1080" << std::endl;
    }
    
    std::cout << "[MP4Muxer] Using resolution: " << width << "x" << height 
              << " @ " << RingBufferEncoder::GetFps() << " fps" << std::endl;
    
    // Create H.264 output media type (pass-through)
    IMFMediaType* mediaType = nullptr;
    MFCreateMediaType(&mediaType);
    mediaType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    mediaType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_H264);
    MFSetAttributeSize(mediaType, MF_MT_FRAME_SIZE, width, height);
    MFSetAttributeRatio(mediaType, MF_MT_FRAME_RATE, RingBufferEncoder::GetFps(), 1);
    MFSetAttributeRatio(mediaType, MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
    mediaType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    mediaType->SetUINT32(MF_MT_AVG_BITRATE, 2500000);  // 2.5 Mbps
    
    // Set codec private data (SPS/PPS in AVCC format)
    // AVCC format: 1 byte version, 1 byte profile, 1 byte compat, 1 byte level,
    //              1 byte NAL size length, 1 byte num SPS, SPS data, 1 byte num PPS, PPS data
    std::vector<uint8_t> avccData;
    avccData.push_back(1);  // Version
    avccData.push_back(sps.size() > 1 ? sps[1] : 0x64);  // Profile (from SPS)
    avccData.push_back(sps.size() > 2 ? sps[2] : 0x00);  // Compatibility
    avccData.push_back(sps.size() > 3 ? sps[3] : 0x1F);  // Level
    avccData.push_back(0xFF);  // NAL length size - 1 (4 bytes - 1 = 3, so 0xFF & 0x03 = 3)
    avccData.push_back(0xE1);  // Number of SPS (1) with reserved bits
    
    // SPS length (big endian)
    avccData.push_back((sps.size() >> 8) & 0xFF);
    avccData.push_back(sps.size() & 0xFF);
    avccData.insert(avccData.end(), sps.begin(), sps.end());
    
    // PPS
    avccData.push_back(1);  // Number of PPS
    avccData.push_back((pps.size() >> 8) & 0xFF);
    avccData.push_back(pps.size() & 0xFF);
    avccData.insert(avccData.end(), pps.begin(), pps.end());
    
    mediaType->SetBlob(MF_MT_MPEG_SEQUENCE_HEADER, avccData.data(), (UINT32)avccData.size());
    
    // Add video stream
    DWORD streamIndex = 0;
    hr = sinkWriter->AddStream(mediaType, &streamIndex);
    mediaType->Release();
    
    if (FAILED(hr)) {
        sinkWriter->Release();
        MFShutdown();
        g_lastError = "AddStream failed: " + std::to_string(hr);
        std::cerr << "[MP4Muxer] " << g_lastError << std::endl;
        return false;
    }
    
    // Set input type to H.264 pass-through
    IMFMediaType* inputType = nullptr;
    MFCreateMediaType(&inputType);
    inputType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    inputType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_H264);
    MFSetAttributeSize(inputType, MF_MT_FRAME_SIZE, width, height);
    MFSetAttributeRatio(inputType, MF_MT_FRAME_RATE, RingBufferEncoder::GetFps(), 1);
    inputType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    
    hr = sinkWriter->SetInputMediaType(streamIndex, inputType, nullptr);
    inputType->Release();
    
    if (FAILED(hr)) {
        sinkWriter->Release();
        MFShutdown();
        g_lastError = "SetInputMediaType failed: " + std::to_string(hr);
        std::cerr << "[MP4Muxer] " << g_lastError << std::endl;
        return false;
    }
    
    // Begin writing
    hr = sinkWriter->BeginWriting();
    if (FAILED(hr)) {
        sinkWriter->Release();
        MFShutdown();
        g_lastError = "BeginWriting failed: " + std::to_string(hr);
        std::cerr << "[MP4Muxer] " << g_lastError << std::endl;
        return false;
    }
    
    // Calculate time range
    int64_t startTimestamp = VideoBuffer::g_videoBuffer.getStartTimestamp();
    int64_t endTimestamp = VideoBuffer::g_videoBuffer.getEndTimestamp();
    int64_t bufferDuration = endTimestamp - startTimestamp;
    
    // Find start packet based on requested duration
    int64_t requestedDuration100ns = (int64_t)durationMs * 10000LL;  // ms to 100ns
    int64_t cutoffTimestamp = endTimestamp - requestedDuration100ns;
    
    // Find first keyframe at or after cutoff
    uint32_t startPacketIdx = 0;
    for (uint32_t i = 0; i < packetCount; i++) {
        const VideoBuffer::VideoPacket* pkt = VideoBuffer::g_videoBuffer.getPacket(i);
        if (pkt && pkt->timestamp_100ns >= cutoffTimestamp && pkt->isKeyframe()) {
            startPacketIdx = i;
            break;
        }
    }
    
    // Get actual start timestamp for offset
    const VideoBuffer::VideoPacket* startPkt = VideoBuffer::g_videoBuffer.getPacket(startPacketIdx);
    int64_t baseTimestamp = startPkt ? startPkt->timestamp_100ns : startTimestamp;
    
    std::cout << "[MP4Muxer] Writing packets " << startPacketIdx << " to " << packetCount 
              << " (starting from keyframe)" << std::endl;
    
    // Write packets
    uint32_t writtenCount = 0;
    for (uint32_t i = startPacketIdx; i < packetCount; i++) {
        const VideoBuffer::VideoPacket* pkt = VideoBuffer::g_videoBuffer.getPacket(i);
        if (!pkt || !pkt->data || pkt->size == 0) continue;
        
        // Create sample
        IMFSample* sample = nullptr;
        hr = MFCreateSample(&sample);
        if (FAILED(hr)) continue;
        
        // Create buffer with NAL data
        IMFMediaBuffer* buffer = nullptr;
        hr = MFCreateMemoryBuffer(pkt->size, &buffer);
        if (FAILED(hr)) {
            sample->Release();
            continue;
        }
        
        // Copy NAL data
        BYTE* bufferData = nullptr;
        hr = buffer->Lock(&bufferData, nullptr, nullptr);
        if (SUCCEEDED(hr)) {
            memcpy(bufferData, pkt->data.get(), pkt->size);
            buffer->Unlock();
            buffer->SetCurrentLength(pkt->size);
        }
        
        sample->AddBuffer(buffer);
        buffer->Release();
        
        // Set timestamps (relative to start of saved segment)
        int64_t sampleTime = pkt->timestamp_100ns - baseTimestamp;
        sample->SetSampleTime(sampleTime);
        sample->SetSampleDuration(10000000LL / RingBufferEncoder::GetFps());
        
        // Mark keyframes
        if (pkt->isKeyframe()) {
            sample->SetUINT32(MFSampleExtension_CleanPoint, TRUE);
        }
        
        // Write sample
        hr = sinkWriter->WriteSample(streamIndex, sample);
        sample->Release();
        
        if (SUCCEEDED(hr)) {
            writtenCount++;
        }
    }
    
    // Finalize
    hr = sinkWriter->Finalize();
    sinkWriter->Release();
    MFShutdown();
    
    if (FAILED(hr)) {
        g_lastError = "Finalize failed: " + std::to_string(hr);
        std::cerr << "[MP4Muxer] " << g_lastError << std::endl;
        return false;
    }
    
    std::cout << "[MP4Muxer] Successfully wrote " << writtenCount << " frames to MP4" << std::endl;
    return true;
}

} // namespace MP4Muxer
