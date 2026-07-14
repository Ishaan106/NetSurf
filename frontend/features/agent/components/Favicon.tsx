import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';

export function Favicon({ url, favicon }: { url: string; favicon?: string }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => { setFailed(false); }, [favicon, url]);
    if (favicon && !failed) {
        return <img src={favicon} alt="" className="h-4 w-4 rounded object-contain" onError={() => setFailed(true)} />;
    }
    return <Globe className="h-4 w-4 text-chrome-text-secondary" />;
}
