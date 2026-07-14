/**
 * NetSurfViewer — Premium "Flight Recorder" replay interface
 *
 * Aesthetic : Cyberpunk-industrial / Vercel dark-mode
 * Layout   : Header → Split-pane (Video 65% | Logs 35%)
 * Controls : Custom overlay (no native <video controls>)
 *
 * Logs stream in as the video plays; click any log to seek.
 */
import React, {
    useState, useRef, useEffect, useCallback, useMemo,
} from 'react';
import {
    Play, Pause, SkipBack, SkipForward, Maximize2, Minimize2,
    Search, X, FolderOpen, Clock, Cpu, MonitorPlay, AlertTriangle,
    Terminal, Globe, Settings2,
} from 'lucide-react';

/* ────────────────────── Types ────────────────────── */

interface LogEntry {
    ts: number;
    type: string;
    msg: string;
}

interface Meta {
    durationMs: number;
    videoDurationMs: number;
    actualFps: number;
    logCount: number;
    createdAt?: string;
    recordingStartEpochMs?: number;
    frameCount?: number;
    [k: string]: any;
}

interface Props {
    onClose: () => void;
}

/* ─────────────────── Log helpers ─────────────────── */

type LogLevel = 'error' | 'warning' | 'info' | 'console' | 'network';

const LEVEL_STYLE: Record<LogLevel, { bg: string; text: string; badge: string }> = {
    error: { bg: 'bg-red-500/8', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400' },
    warning: { bg: 'bg-amber-500/8', text: 'text-amber-300', badge: 'bg-amber-500/20 text-amber-300' },
    info: { bg: 'bg-sky-500/6', text: 'text-sky-400', badge: 'bg-sky-500/20 text-sky-400' },
    console: { bg: 'bg-transparent', text: 'text-zinc-400', badge: 'bg-zinc-700/40 text-zinc-400' },
    network: { bg: 'bg-emerald-500/6', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-400' },
};

const MARKER_CLR: Record<string, string> = {
    error: '#ef4444', warning: '#f59e0b', info: '#38bdf8',
    console: '#71717a', network: '#34d399',
};

const TABS = [
    { id: 'console', label: 'Console', icon: Terminal },
    { id: 'network', label: 'Network', icon: Globe },
    { id: 'all', label: 'All', icon: Settings2 },
] as const;

type TabId = typeof TABS[number]['id'];

/* ════════════════════════════════════════════════════ */

const NetSurfViewer: React.FC<Props> = ({ onClose }) => {
    /* ── File state ── */
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [meta, setMeta] = useState<Meta | null>(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    /* ── Playback ── */
    const [playing, setPlaying] = useState(false);
    const [cur, setCur] = useState(0);
    const [dur, setDur] = useState(0);
    const [spd, setSpd] = useState(1);
    const [hoverCtrl, setHoverCtrl] = useState(false);

    /* ── Layout ── */
    const [splitPct, setSplitPct] = useState(65);
    const [expanded, setExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<TabId>('all');
    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    /* ── Refs ── */
    const videoRef = useRef<HTMLVideoElement>(null);
    const logEndRef = useRef<HTMLDivElement>(null);
    const splitDrag = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);

    /* ──────── Open .netsurf file ──────── */
    const openFile = async () => {
        try {
            const res = await (window as any).electronAPI?.dialog?.showOpenDialog({
                title: 'Open .netsurf Recording',
                filters: [{ name: 'NetSurf Recording', extensions: ['netsurf'] }],
                properties: ['openFile'],
            });
            if (!res || res.canceled || !res.filePaths?.length) return;
            setLoading(true); setErr('');
            const data = await (window as any).electronAPI?.netsurf?.openRecording(res.filePaths[0]);
            if (!data?.success) { setErr(data?.error || 'Open failed'); setLoading(false); return; }
            setVideoUrl(data.videoUrl);

            // Merge console logs + network logs, sort by timestamp
            const consoleLogs: LogEntry[] = (data.logs || []);
            const networkLogs: LogEntry[] = (data.network || []).map((n: any) => ({
                ...n,
                type: 'network', // ensure type is set
            }));
            const allLogs = [...consoleLogs, ...networkLogs].sort((a, b) => a.ts - b.ts);
            setLogs(allLogs);

            setMeta(data.metadata);
            setCur(0); setPlaying(false); setDur(0); setLoading(false);
        } catch (e: any) { setErr(e.message); setLoading(false); }
    };

    /* ──────── Drift correction ──────── */
    const toLogMs = useCallback((vSec: number) => {
        if (!meta?.videoDurationMs || !meta?.durationMs) return vSec * 1000;
        return vSec * 1000 * (meta.durationMs / meta.videoDurationMs);
    }, [meta]);

    const logMs = toLogMs(cur);

    /* ──────── Filtered + visible logs ──────── */
    const filtered = useMemo(() => {
        let list = logs;
        if (activeTab === 'console') list = list.filter(l => l.type !== 'network');
        if (activeTab === 'network') list = list.filter(l => l.type === 'network');
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(l => l.msg.toLowerCase().includes(q));
        }
        return list;
    }, [logs, activeTab, search]);

    const visible = useMemo(() => filtered.filter(l => l.ts <= logMs), [filtered, logMs]);

    /* auto-scroll */
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [visible.length]);

    /* ──────── Video controls ──────── */
    const togglePlay = useCallback(() => {
        if (!videoRef.current) return;
        playing ? videoRef.current.pause() : videoRef.current.play();
    }, [playing]);

    const stepFrame = (dir: 1 | -1) => {
        if (!videoRef.current) return;
        const fps = meta?.actualFps || 60;
        videoRef.current.currentTime = Math.max(0, Math.min(dur, videoRef.current.currentTime + dir / fps));
    };

    const scrub = (e: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
        if (!videoRef.current || !dur) return;
        const r = e.currentTarget.getBoundingClientRect();
        videoRef.current.currentTime = ((e.clientX - r.left) / r.width) * dur;
    };

    const cycleSpeed = () => {
        const arr = [0.5, 1, 1.5, 2];
        const next = arr[(arr.indexOf(spd) + 1) % arr.length];
        setSpd(next);
        if (videoRef.current) videoRef.current.playbackRate = next;
    };

    const seekLog = (log: LogEntry) => {
        if (!videoRef.current || !meta) return;
        const r = (meta.videoDurationMs && meta.durationMs) ? meta.videoDurationMs / meta.durationMs : 1;
        videoRef.current.currentTime = (log.ts * r) / 1000;
    };

    /* ──────── Keyboard shortcuts ──────── */
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;
            if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
            if (e.code === 'ArrowLeft') { e.preventDefault(); stepFrame(-1); }
            if (e.code === 'ArrowRight') { e.preventDefault(); stepFrame(1); }
            if (e.code === 'KeyF') { e.preventDefault(); setExpanded(x => !x); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [togglePlay]);

    /* ──────── Drag-resize split ──────── */
    useEffect(() => {
        const move = (e: MouseEvent) => {
            if (!splitDrag.current || !containerRef.current) return;
            const r = containerRef.current.getBoundingClientRect();
            const pct = ((e.clientX - r.left) / r.width) * 100;
            setSplitPct(Math.max(40, Math.min(80, pct)));
        };
        const up = () => { splitDrag.current = false; document.body.style.cursor = ''; };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, []);

    /* ──────── Timeline markers ──────── */
    const markers = useMemo(() => {
        if (!meta || dur === 0) return [];
        const r = (meta.videoDurationMs && meta.durationMs) ? meta.videoDurationMs / meta.durationMs : 1;
        return logs.map(l => ({
            pct: Math.min(100, Math.max(0, ((l.ts * r) / 1000 / dur) * 100)),
            type: l.type,
        }));
    }, [logs, meta, dur]);

    /* ──────── Format helpers ──────── */
    const fmt = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };
    const fmtMs = (ms: number) => fmt(ms / 1000);

    /* ──────── Level style helper ──────── */
    const lvl = (type: string): typeof LEVEL_STYLE['console'] =>
        LEVEL_STYLE[type as LogLevel] || LEVEL_STYLE.console;

    const pct = dur > 0 ? (cur / dur) * 100 : 0;

    /* ════════════════ EMPTY STATE ════════════════ */
    if (!videoUrl) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-zinc-300 font-sans select-none">
                <button onClick={onClose}
                    className="absolute top-4 left-4 px-3 py-1.5 text-xs text-zinc-500 border border-zinc-800 rounded hover:border-zinc-600 hover:text-zinc-300 transition-colors"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <X size={14} className="inline mr-1 -mt-px" />Close
                </button>

                <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                        <MonitorPlay size={28} className="text-cyan-500" />
                    </div>
                    <h1 className="text-lg font-semibold tracking-tight text-zinc-100">NetSurf Replay Viewer</h1>
                    <p className="text-xs text-zinc-600 max-w-xs text-center">
                        Open a <span className="font-mono text-zinc-400">.netsurf</span> flight recording to replay with synchronised console logs
                    </p>

                    {err && (
                        <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                            {err}
                        </div>
                    )}

                    <button onClick={openFile} disabled={loading}
                        className="mt-4 px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm rounded transition-colors disabled:opacity-50">
                        <FolderOpen size={14} className="inline mr-1.5 -mt-px" />
                        {loading ? 'Loading…' : 'Open .netsurf'}
                    </button>
                </div>

                <div className="absolute bottom-6 text-2xs text-zinc-700 font-mono">
                    SPACEBAR play · ← → frame step · F fullscreen
                </div>
            </div>
        );
    }

    /* ════════════════ VIEWER ════════════════ */
    return (
        <div className="h-screen flex flex-col bg-[#0a0a0a] text-zinc-300 font-sans select-none overflow-hidden"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>

            {/* ═══════ HEADER ═══════ */}
            {!expanded && (
                <header className="flex items-center h-9 px-3 border-b border-zinc-800/80 bg-[#0e0e0e] flex-shrink-0 gap-3"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <button onClick={onClose}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-zinc-400 border border-zinc-700 rounded hover:border-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
                        <X size={12} />
                        <span>Close</span>
                    </button>
                    <div className="w-px h-4 bg-zinc-800" />
                    <span className="text-xs font-semibold tracking-tight text-zinc-200">REPLAY</span>

                    {meta && (
                        <div className="flex items-center gap-4 ml-3 text-2xs font-mono text-zinc-600">
                            <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {meta.createdAt ? new Date(meta.createdAt).toLocaleString() : '—'}
                            </span>
                            <span className="flex items-center gap-1">
                                <Cpu size={10} />
                                {meta.actualFps?.toFixed(1)} fps
                            </span>
                            <span>{fmt(meta.durationMs / 1000)} duration</span>
                            <span>{logs.length} events</span>
                            {meta.frameCount && <span>{meta.frameCount} frames</span>}
                        </div>
                    )}

                    <div className="flex-1" />
                    <button onClick={openFile}
                        className="px-2 py-0.5 text-2xs text-zinc-500 border border-zinc-800 rounded hover:border-zinc-600 hover:text-zinc-300 transition-colors">
                        Open…
                    </button>
                </header>
            )}

            {/* ═══════ SPLIT PANE ═══════ */}
            <div ref={containerRef} className="flex-1 flex min-h-0">

                {/* ─── VIDEO COLUMN ─── */}
                <div
                    className="flex flex-col min-w-0 min-h-0 relative"
                    style={{ width: expanded ? '100%' : `${splitPct}%` }}
                    onMouseEnter={() => setHoverCtrl(true)}
                    onMouseLeave={() => setHoverCtrl(false)}
                >
                    {/* Video */}
                    <div className="flex-1 flex items-center justify-center bg-black min-h-0 relative overflow-hidden">
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            onLoadedMetadata={() => { if (videoRef.current) setDur(videoRef.current.duration); }}
                            onTimeUpdate={() => { if (videoRef.current) setCur(videoRef.current.currentTime); }}
                            onPlay={() => setPlaying(true)}
                            onPause={() => setPlaying(false)}
                            onEnded={() => setPlaying(false)}
                            className="max-w-full max-h-full object-contain"
                            playsInline
                        />

                        {/* Click anywhere to play/pause */}
                        <div
                            onClick={togglePlay}
                            onDoubleClick={(e) => { e.stopPropagation(); setExpanded(x => !x); }}
                            className="absolute inset-0 z-10 cursor-pointer"
                        />
                        {/* Center play icon when paused */}
                        {!playing && dur > 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                                <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                                    <Play size={28} className="text-white ml-1" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ─ TIMELINE STRIP ─ */}
                    <div className="h-5 bg-[#0e0e0e] border-t border-zinc-800/50 px-2 flex items-center flex-shrink-0">
                        <div
                            onClick={scrub}
                            onPointerDown={(e) => {
                                scrub(e);
                                const onMove = (ev: PointerEvent) => {
                                    if (!videoRef.current || !dur) return;
                                    const el = e.currentTarget;
                                    const r = el.getBoundingClientRect();
                                    videoRef.current.currentTime = Math.max(0, Math.min(dur,
                                        ((ev.clientX - r.left) / r.width) * dur));
                                };
                                const onUp = () => {
                                    window.removeEventListener('pointermove', onMove);
                                    window.removeEventListener('pointerup', onUp);
                                };
                                window.addEventListener('pointermove', onMove);
                                window.addEventListener('pointerup', onUp);
                            }}
                            className="flex-1 h-2.5 bg-zinc-900 rounded-sm cursor-pointer relative group"
                        >
                            {/* progress */}
                            <div className="absolute inset-y-0 left-0 bg-cyan-500/20 rounded-sm"
                                style={{ width: `${pct}%` }} />
                            {/* markers */}
                            {markers.map((m, i) => (
                                <div key={i} className="absolute bottom-0" style={{
                                    left: `${m.pct}%`, width: 1.5,
                                    height: m.type === 'error' ? '100%' : '50%',
                                    background: MARKER_CLR[m.type] || '#555',
                                    opacity: 0.75,
                                }} />
                            ))}
                            {/* playhead */}
                            <div className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-10"
                                style={{ left: `${pct}%`, transform: 'translateX(-50%)' }} />
                            {/* hover knob */}
                            <div className="absolute top-1/2 w-3 h-3 rounded-full bg-cyan-400 border-2 border-[#0a0a0a] -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                                style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }} />
                        </div>
                    </div>

                    {/* ─ CONTROLS BAR ─ */}
                    <div className={`h-10 bg-[#0e0e0e] border-t border-zinc-800/50 px-3 flex items-center gap-2 flex-shrink-0 transition-opacity duration-200 ${hoverCtrl || !playing ? 'opacity-100' : 'opacity-40'}`}>
                        {/* Frame back */}
                        <button onClick={() => stepFrame(-1)}
                            className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors" title="Previous frame (←)">
                            <SkipBack size={14} />
                        </button>

                        {/* Play / Pause */}
                        <button onClick={togglePlay}
                            className="w-8 h-8 rounded bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-400/40 transition-all"
                            title="Space">
                            {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                        </button>

                        {/* Frame forward */}
                        <button onClick={() => stepFrame(1)}
                            className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors" title="Next frame (→)">
                            <SkipForward size={14} />
                        </button>

                        {/* Time */}
                        <span className="text-2xs font-mono text-zinc-500 tabular-nums min-w-[90px]">
                            <span className="text-zinc-300">{fmt(cur)}</span>
                            {' / '}
                            {fmt(dur)}
                        </span>

                        <div className="flex-1" />

                        {/* Speed */}
                        <button onClick={cycleSpeed}
                            className="px-2 py-0.5 text-2xs font-mono text-zinc-500 border border-zinc-800 rounded hover:border-zinc-600 hover:text-zinc-300 transition-colors tabular-nums">
                            {spd}×
                        </button>

                        {/* Expand toggle */}
                        <button onClick={() => setExpanded(x => !x)}
                            className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors" title="Fullscreen (F)">
                            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                    </div>
                </div>

                {/* ─── RESIZE HANDLE ─── */}
                {!expanded && (
                    <div
                        onMouseDown={() => { splitDrag.current = true; document.body.style.cursor = 'col-resize'; }}
                        className="w-1 bg-zinc-800/50 hover:bg-cyan-500/30 cursor-col-resize flex-shrink-0 transition-colors"
                    />
                )}

                {/* ─── LOG PANEL ─── */}
                {!expanded && (
                    <div className="flex flex-col min-h-0" style={{ width: `${100 - splitPct}%` }}>
                        {/* Tab bar */}
                        <div className="flex items-center h-9 px-2 bg-[#0e0e0e] border-b border-zinc-800/80 flex-shrink-0 gap-1">
                            {TABS.map(tab => {
                                const Icon = tab.icon;
                                const active = activeTab === tab.id;
                                return (
                                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 text-2xs font-medium rounded transition-colors
                                            ${active
                                                ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                                                : 'text-zinc-600 hover:text-zinc-400 border border-transparent'
                                            }`}>
                                        <Icon size={11} />
                                        {tab.label}
                                    </button>
                                );
                            })}

                            <div className="flex-1" />

                            {/* Search toggle */}
                            <button onClick={() => setShowSearch(s => !s)}
                                className={`p-1 rounded transition-colors ${showSearch ? 'text-cyan-400' : 'text-zinc-600 hover:text-zinc-400'}`}>
                                <Search size={12} />
                            </button>

                            {/* Log counter */}
                            <span className="text-2xs font-mono text-zinc-700 tabular-nums">
                                {visible.length}<span className="text-zinc-800">/{logs.length}</span>
                            </span>
                        </div>

                        {/* Search bar */}
                        {showSearch && (
                            <div className="flex items-center h-7 px-2 bg-[#0c0c0c] border-b border-zinc-800/60 flex-shrink-0">
                                <Search size={11} className="text-zinc-600 mr-2 flex-shrink-0" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Filter logs…"
                                    autoFocus
                                    className="flex-1 bg-transparent text-xs text-zinc-300 placeholder-zinc-700 outline-none font-mono"
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="text-zinc-600 hover:text-zinc-400">
                                        <X size={11} />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Log entries */}
                        <div className="flex-1 overflow-y-auto scrollbar-none bg-[#0a0a0a]">
                            {visible.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-700">
                                    <Terminal size={20} />
                                    <span className="text-2xs">
                                        {logs.length === 0 ? 'No events in recording' : 'Press play to stream logs…'}
                                    </span>
                                </div>
                            ) : (
                                visible.map((log, i) => {
                                    const s = lvl(log.type);

                                    // Structured network entry rendering
                                    if (log.type === 'network') {
                                        let net: any = null;
                                        try { net = JSON.parse(log.msg); } catch { }
                                        if (net) {
                                            const statusClr = net.status >= 400 ? 'text-red-400'
                                                : net.status >= 300 ? 'text-amber-400'
                                                    : net.status >= 200 ? 'text-emerald-400'
                                                        : 'text-zinc-500';
                                            const shortUrl = (net.url || '').replace(/^https?:\/\//, '').slice(0, 60);
                                            return (
                                                <div
                                                    key={i}
                                                    onClick={() => seekLog(log)}
                                                    className={`flex items-center gap-2 px-2.5 py-1 border-b border-zinc-900 cursor-pointer hover:bg-zinc-800/30 ${s.bg}`}
                                                >
                                                    <span className="text-2xs font-mono text-zinc-700 tabular-nums flex-shrink-0 w-10">
                                                        {fmtMs(log.ts)}
                                                    </span>
                                                    <span className={`text-2xs font-mono font-bold px-1.5 py-px rounded ${net.method === 'GET' ? 'bg-sky-500/20 text-sky-400'
                                                        : net.method === 'POST' ? 'bg-amber-500/20 text-amber-300'
                                                            : 'bg-zinc-700/40 text-zinc-400'}`}>
                                                        {net.method || 'GET'}
                                                    </span>
                                                    <span className={`text-2xs font-mono font-bold tabular-nums ${statusClr} flex-shrink-0`}>
                                                        {net.status || '—'}
                                                    </span>
                                                    <span className="text-xs font-mono text-zinc-400 truncate flex-1" title={net.url}>
                                                        {shortUrl}{(net.url || '').length > 60 ? '…' : ''}
                                                    </span>
                                                    <span className="text-2xs font-mono text-zinc-700 flex-shrink-0">
                                                        {net.type || ''}
                                                    </span>
                                                </div>
                                            );
                                        }
                                    }

                                    // Default console/error/warning/info rendering
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => seekLog(log)}
                                            className={`flex items-start gap-2 px-2.5 py-1 border-b border-zinc-900 cursor-pointer hover:bg-zinc-800/30 transition-colors ${s.bg}`}
                                        >
                                            {/* timestamp */}
                                            <span className="text-2xs font-mono text-zinc-700 tabular-nums flex-shrink-0 mt-px w-10">
                                                {fmtMs(log.ts)}
                                            </span>
                                            {/* badge */}
                                            <span className={`text-2xs font-mono font-bold uppercase flex-shrink-0 px-1.5 py-px rounded ${s.badge}`}>
                                                {log.type === 'warning' ? 'warn' : log.type.substring(0, 4)}
                                            </span>
                                            {/* message */}
                                            <span className={`text-xs font-mono break-all leading-relaxed flex-1 ${s.text}`}>
                                                {log.type === 'error' && <AlertTriangle size={10} className="inline mr-1 -mt-px" />}
                                                {log.msg}
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={logEndRef} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NetSurfViewer;
