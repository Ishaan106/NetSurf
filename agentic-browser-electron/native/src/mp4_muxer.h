/**
 * MP4 MUXER - Mux H.264 NALs from Ring Buffer to MP4
 * 
 * Zero re-encode: Takes raw H.264 NAL units from ring buffer and writes to MP4
 * 
 * Usage:
 *   1. Call SaveRingBufferToMP4(path) to save last 2 minutes
 *   2. Call SaveRingBufferToMP4(path, durationMs) to save specific duration
 */

#pragma once

#include <cstdint>
#include <string>

namespace MP4Muxer {

// Save ring buffer contents to MP4 file
// Returns true on success
bool SaveRingBufferToMP4(const std::wstring& outputPath);

// Save last N milliseconds to MP4
bool SaveRingBufferToMP4(const std::wstring& outputPath, uint32_t durationMs);

// Get last error message
const std::string& GetLastError();

} // namespace MP4Muxer
