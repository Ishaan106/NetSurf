/**
 * RING BUFFER ENCODER - Header
 * 
 * FIXED Zero-Copy H.264 NAL Capture Pipeline:
 *   DXGI Capture → PrivacyBlur → D3D11 Video Processor → MFT Encoder → H.264 NALs → RingBuffer
 * 
 * FIXES:
 * 1. GPU matching: Capture GPU == Encoder GPU
 * 2. Texture pool: 4 NV12 textures to avoid reuse conflicts
 * 3. Per-frame samples: Fresh IMFSample per frame
 * 4. Async MFT: Proper drain-before-input flow control
 * 5. Shared blur: Single blur pass before encode
 * 
 * Intel QuickSync / NVIDIA NVENC @ 2500kbps
 * Dynamic memory allocation (~40MB for 2 minutes)
 */

#pragma once

#include <cstdint>
#include <vector>

namespace RingBufferEncoder {

// Start/stop capture + encoding
bool Start();
void Stop();
bool IsRecording();
void Cleanup();

// Get frame count
uint64_t GetFrameCount();

// FPS control (15-120, default 60)
void SetFps(int fps);
int GetFps();

// Get capture dimensions
uint32_t GetWidth();
uint32_t GetHeight();

// SPS/PPS access for MP4 muxing (no re-encode)
const std::vector<uint8_t>& GetSPS();
const std::vector<uint8_t>& GetPPS();
bool HasHeaders();

// Wall-clock epoch time when recording started (for log correlation)
int64_t GetRecordingStartEpochMs();

} // namespace RingBufferEncoder
