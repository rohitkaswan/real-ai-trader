import React, { useState } from 'react';
import {
  Sparkles,
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle,
  RefreshCw,
  Cpu,
  Bot,
} from 'lucide-react';
import { SystemDiagnosticAlert } from '../types';

interface AutoHealerPanelProps {
  incidents: SystemDiagnosticAlert[];
  onTriggerScan: () => Promise<void>;
}

export const AutoHealerPanel: React.FC<AutoHealerPanelProps> = ({
  incidents,
  onTriggerScan,
}) => {
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      await onTriggerScan();
    } finally {
      setIsScanning(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertOctagon className="w-4 h-4 text-rose-400" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      default:
        return <Info className="w-4 h-4 text-cyan-400" />;
    }
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs font-mono flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="font-bold text-zinc-200 text-sm tracking-wide">
            AI-DRIVEN INCIDENT DIAGNOSTIC &amp; AUTO-HEALER
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">
            ACTIVE ENGINE
          </span>
        </div>

        <button
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-950 hover:bg-indigo-900 text-indigo-200 border border-indigo-800 text-xs font-semibold transition disabled:opacity-50"
        >
          {isScanning ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Bot className="w-3.5 h-3.5" />
          )}
          <span>{isScanning ? 'DIAGNOSING...' : 'RUN AI DIAGNOSTIC SCAN'}</span>
        </button>
      </div>

      {/* Incident Stream */}
      {incidents.length > 0 ? (
        <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
          {incidents.map((incident, idx) => {
            const timeStr = new Date(incident.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            });

            return (
              <div
                key={`${incident.id}-${idx}`}
                className="bg-zinc-900/70 border border-zinc-800/80 rounded-md p-3 space-y-1.5 transition hover:border-zinc-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getSeverityIcon(incident.severity)}
                    <span className="font-bold text-zinc-200">
                      [{incident.component}]
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                        incident.severity === 'CRITICAL'
                          ? 'bg-rose-950 text-rose-400 border border-rose-800'
                          : incident.severity === 'WARNING'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                      }`}
                    >
                      {incident.severity}
                    </span>
                  </div>
                  <span className="text-zinc-500 text-[10px]">{timeStr}</span>
                </div>

                <p className="text-zinc-300 text-[11px] font-medium">
                  {incident.message}
                </p>

                {incident.aiDiagnosis && (
                  <div className="bg-zinc-950/80 rounded p-2 border border-zinc-800/60 text-[11px] text-zinc-300">
                    <span className="text-indigo-400 font-bold block text-[10px] mb-0.5">
                      GEMINI DIAGNOSIS:
                    </span>
                    {incident.aiDiagnosis}
                  </div>
                )}

                {incident.autoRemediationApplied && (
                  <div className="flex items-start gap-1.5 text-emerald-400 text-[10px] bg-emerald-950/20 p-1.5 rounded border border-emerald-900/40">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      <strong>Remediation Applied:</strong> {incident.autoRemediationApplied}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-10 text-center text-zinc-600 border border-dashed border-zinc-800 rounded-md">
          Zero active incidents detected. All system components, feeds, and risk sentinels operating normally.
        </div>
      )}
    </div>
  );
};
