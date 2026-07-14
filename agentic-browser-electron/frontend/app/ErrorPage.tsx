/**
 * ErrorPage — Vercel-dark themed error overlay for failed page loads
 *
 * Shown when a webview's did-fail-load event fires.
 * Styled to match Vercel's minimal dark aesthetic.
 */
import React from 'react';
import {
    WifiOff, ShieldAlert, AlertTriangle, RefreshCw,
    Globe, Clock, ServerCrash, Ban,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ─── Error code → human message mapping ─── */

interface ErrorMeta {
    icon: LucideIcon;
    title: string;
    description: string;
}

const ERROR_MAP: Record<number, ErrorMeta> = {
    // DNS
    [-105]: { icon: WifiOff, title: "This site can't be reached", description: "DNS address could not be found. Check your internet connection or the URL." },
    [-106]: { icon: WifiOff, title: "You're offline", description: "Check your internet connection and try again." },
    [-109]: { icon: WifiOff, title: "This site can't be reached", description: "The server's IP address could not be found." },
    // Connection
    [-2]: { icon: ServerCrash, title: "Network error", description: "A network change was detected. Please reload the page." },
    [-7]: { icon: Clock, title: "Connection timed out", description: "The server took too long to respond. Try again later." },
    [-21]: { icon: Clock, title: "Network changed", description: "A network change was detected during the page load." },
    [-100]: { icon: ServerCrash, title: "Connection closed", description: "The connection to the server was unexpectedly closed." },
    [-101]: { icon: ServerCrash, title: "Connection reset", description: "The connection was reset. The server may be down or your network changed." },
    [-102]: { icon: ServerCrash, title: "Connection refused", description: "The server refused the connection. It may not be running." },
    [-104]: { icon: ServerCrash, title: "Connection failed", description: "Failed to establish a connection to the server." },
    [-118]: { icon: Clock, title: "Connection timed out", description: "The server is taking too long to respond." },
    // SSL/TLS
    [-200]: { icon: ShieldAlert, title: "Connection isn't private", description: "Attackers might be trying to steal your information. NET::ERR_CERT_COMMON_NAME_INVALID" },
    [-201]: { icon: ShieldAlert, title: "Certificate expired", description: "The server's security certificate has expired." },
    [-202]: { icon: ShieldAlert, title: "Certificate authority invalid", description: "The server's certificate is not trusted by your system." },
    [-203]: { icon: ShieldAlert, title: "Certificate invalid", description: "The server presented an invalid certificate." },
    [-204]: { icon: ShieldAlert, title: "Certificate revoked", description: "The server's security certificate has been revoked." },
    // HTTP errors
    [-310]: { icon: Ban, title: "Too many redirects", description: "The page redirected too many times. Try clearing cookies." },
    [-324]: { icon: ServerCrash, title: "Empty response", description: "The server closed the connection without sending any data." },
    [-330]: { icon: ServerCrash, title: "Content decoding failed", description: "The response could not be decoded." },
    // Blocked
    [-350]: { icon: Ban, title: "Blocked by response", description: "The page was blocked by the server's response headers." },
};

const DEFAULT_ERROR: ErrorMeta = {
    icon: AlertTriangle,
    title: "Something went wrong",
    description: "The page could not be loaded.",
};

interface Props {
    errorCode: number;
    errorDescription: string;
    validatedURL: string;
    onRetry: () => void;
    onGoBack?: () => void;
}

const ErrorPage: React.FC<Props> = ({
    errorCode,
    errorDescription,
    validatedURL,
    onRetry,
    onGoBack,
}) => {
    const meta = ERROR_MAP[errorCode] || DEFAULT_ERROR;
    const Icon = meta.icon;

    // Extract hostname for display
    let hostname = validatedURL;
    try {
        hostname = new URL(validatedURL).hostname;
    } catch { /* use raw URL */ }

    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0a0a0a] text-zinc-300 font-sans select-none"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>

            {/* Content card */}
            <div className="flex flex-col items-center max-w-md w-full px-8">

                {/* Icon */}
                <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6 shadow-lg shadow-black/30">
                    <Icon size={36} className="text-zinc-500" />
                </div>

                {/* Title */}
                <h1 className="text-xl font-semibold tracking-tight text-zinc-100 text-center mb-2">
                    {meta.title}
                </h1>

                {/* URL chip */}
                <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full mb-4">
                    <Globe size={12} className="text-zinc-600 flex-shrink-0" />
                    <span className="text-xs font-mono text-zinc-500 truncate max-w-[260px]">
                        {hostname}
                    </span>
                </div>

                {/* Description */}
                <p className="text-sm text-zinc-500 text-center leading-relaxed mb-2">
                    {meta.description}
                </p>

                {/* Error code */}
                <span className="text-xs font-mono text-zinc-700 mb-8">
                    {errorDescription || `ERR_CODE_${Math.abs(errorCode)}`}
                </span>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                    {onGoBack && (
                        <button
                            onClick={onGoBack}
                            className="px-5 py-2.5 text-sm font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 transition-all duration-200"
                        >
                            Go back
                        </button>
                    )}
                    <button
                        onClick={onRetry}
                        className="px-5 py-2.5 text-sm font-medium text-black bg-white rounded-lg hover:bg-zinc-200 transition-all duration-200 shadow-sm flex items-center gap-2"
                    >
                        <RefreshCw size={14} />
                        Reload
                    </button>
                </div>

                {/* Subtle divider + tips */}
                <div className="mt-10 pt-6 border-t border-zinc-900 w-full">
                    <p className="text-xs text-zinc-700 text-center leading-relaxed">
                        Check your internet connection · Clear browser cache · Try again later
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ErrorPage;
