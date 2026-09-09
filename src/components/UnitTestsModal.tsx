import React, { useState, useEffect } from 'react';
import { FlaskConical, CheckCircle2, XCircle, RefreshCw, Clock } from 'lucide-react';
import { UnitTestResult } from '../types';

interface UnitTestsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UnitTestsModal: React.FC<UnitTestsModalProps> = ({ isOpen, onClose }) => {
  const [tests, setTests] = useState<UnitTestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRunTime, setLastRunTime] = useState<number | null>(null);

  const runTests = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/tests/run');
      const data = await res.json();
      setTests(data.results || []);
      setLastRunTime(data.timestamp);
    } catch (err) {
      console.error('Failed to run tests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runTests();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const passedCount = tests.filter(t => t.passed).length;
  const totalCount = tests.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono text-xs">
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-2xl w-full p-5 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <FlaskConical className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold text-zinc-100">
                QUANTITATIVE SUITE PRE-FLIGHT VERIFICATION
              </h2>
              <p className="text-[11px] text-zinc-400">
                Deterministic unit tests for Parkinson, Hurst, Sortino, Brier, Reaper, and Sentinel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-sm px-2 py-1"
          >
            ✕
          </button>
        </div>

        {/* Status Banner */}
        <div className="flex items-center justify-between bg-zinc-900/80 p-3 rounded border border-zinc-800 mb-4">
          <div className="flex items-center gap-2">
            <span
              className={`font-bold text-sm ${
                passedCount === totalCount && totalCount > 0
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {passedCount} / {totalCount} TESTS PASSED
            </span>
            {lastRunTime && (
              <span className="text-zinc-500 text-[10px]">
                (Last run: {new Date(lastRunTime).toLocaleTimeString()})
              </span>
            )}
          </div>
          <button
            onClick={runTests}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'RUNNING...' : 'RE-RUN SUITE'}</span>
          </button>
        </div>

        {/* Test List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {tests.map((test, index) => (
            <div
              key={index}
              className={`p-3 rounded border flex flex-col gap-1 transition ${
                test.passed
                  ? 'bg-zinc-900/40 border-zinc-800/80'
                  : 'bg-rose-950/20 border-rose-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {test.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="font-bold text-zinc-200 text-[11px]">
                    {test.name}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {test.durationMs}ms
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 pl-6">
                {test.message}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
