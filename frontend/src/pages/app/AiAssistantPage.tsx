import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity,
  Database,
  Lock,
  Plus,
  Send,
  Sliders,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  X,
} from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';
import { formatKes } from '../../i18n/translations';

export const AiAssistantPage: React.FC = () => {
  const { activeOrg, selectedBranchId, language, hasFeature } = useAuth();
  const [aiLang, setAiLang] = useState<'en' | 'sw'>(language);
  const [conversations, setConversations] = useState<any[]>([]);
  const [suggested, setSuggested] = useState<{ en: string[]; sw: string[] }>({ en: [], sw: [] });
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<any | null>(null);

  // Interactive What-If Financial Scenario Simulator state
  const [showSim, setShowSim] = useState(false);
  const [simInputs, setSimInputs] = useState({
    priceChangePct: 5,
    volumeChangePct: 5,
    expenseChangePct: -10,
    stockoutRecoveryPct: 4,
  });
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const allowed = hasFeature('ai_assistant');

  const loadConversations = async () => {
    if (!allowed) return;
    try {
      const [res, st] = await Promise.all([
        apiRequest('/ai/conversations'),
        apiRequest('/ai/status').catch(() => null),
      ]);
      setConversations(res.conversations || []);
      setSuggested(res.suggestedQuestions || { en: [], sw: [] });
      if (st) setStatus(st);
      if (res.conversations?.[0] && !activeConvId) {
        selectConversation(res.conversations[0].id);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const selectConversation = async (id: string) => {
    setActiveConvId(id);
    try {
      const res = await apiRequest(`/ai/conversations/${id}/messages`);
      setMessages(res.messages || []);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startNewConversation = async () => {
    const res = await apiRequest('/ai/conversations', {
      method: 'POST',
      body: { language: aiLang, branchId: selectedBranchId },
    });
    setConversations((prev) => [res.conversation, ...prev]);
    setActiveConvId(res.conversation.id);
    setMessages([]);
    return res.conversation.id as string;
  };

  useEffect(() => {
    loadConversations();
  }, [activeOrg?.id]);

  const runSimulation = async () => {
    setSimLoading(true);
    try {
      const res = await apiRequest('/ai/simulate', {
        method: 'POST',
        body: { ...simInputs, branchId: selectedBranchId },
      });
      setSimResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSimLoading(false);
    }
  };

  const sendQuestion = async (questionText?: string) => {
    const q = (questionText ?? input).trim();
    if (!q) return;
    setSending(true);
    setError('');
    setInput('');
    try {
      let cid = activeConvId;
      if (!cid) cid = await startNewConversation();
      setMessages((prev) => [...prev, { id: `tmp-${Date.now()}`, role: 'user', content: q, language: aiLang }]);
      const res = await apiRequest(`/ai/conversations/${cid}/messages`, {
        method: 'POST',
        body: { content: q, language: aiLang, branchId: selectedBranchId },
      });
      setMessages((prev) => [...prev, res.assistantMessage]);
      loadConversations();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const rateMessage = async (messageId: string, rating: 1 | -1) => {
    try {
      await apiRequest(`/ai/messages/${messageId}/feedback`, { method: 'POST', body: { rating } });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, user_rating: rating } : m)));
    } catch {}
  };

  const speakMessage = async (msg: any) => {
    setSpeakingId(msg.id);
    try {
      const res = await apiRequest('/ai/voice/speak', {
        method: 'POST',
        body: { text: msg.content, language: msg.language === 'sw' ? 'sw' : aiLang },
      });
      if (res.audioBase64) {
        const audio = new Audio(`data:${res.mimeType || 'audio/wav'};base64,${res.audioBase64}`);
        audio.onended = () => setSpeakingId(null);
        await audio.play();
      } else if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(msg.content.replace(/[*#`]/g, ''));
        utt.lang = msg.language === 'sw' ? 'sw-KE' : 'en-KE';
        utt.onend = () => setSpeakingId(null);
        window.speechSynthesis.speak(utt);
      } else {
        setSpeakingId(null);
      }
    } catch {
      setSpeakingId(null);
    }
  };

  if (!allowed) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-xl mx-auto text-center space-y-3">
        <Lock className="w-10 h-10 text-amber-500 mx-auto" />
        <h1 className="text-xl font-bold text-navy-950">BizWave AI Requires Intelligence or Enterprise Plan</h1>
        <p className="text-sm text-slate-600">
          Your workspace ({activeOrg?.display_name}) is on the <strong>{activeOrg?.plan_code.toUpperCase()}</strong> plan. Upgrade to unlock English &amp; Kiswahili conversational intelligence, Executive Health Diagnostics, and What-If Simulations.
        </p>
        <Link to="/app/billing" className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-[#041527] text-[#2ED3C2] text-sm font-bold">
          Upgrade Subscription Plan
        </Link>
      </div>
    );
  }

  const promptChips = aiLang === 'sw' ? suggested.sw : suggested.en;

  return (
    <div className="space-y-4">
      {/* Executive AI Action Strip */}
      <div className="bg-[#041527] text-white rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 border border-[#2ED3C2]/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2ED3C2]/15 border border-[#2ED3C2]/30 flex items-center justify-center text-[#2ED3C2]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#2ED3C2]">Ask Anything About Your Numbers</div>
            <h1 className="text-base sm:text-lg font-extrabold text-white">BizWave AI — Executive Decision Copilot</h1>
            <p className="text-xs text-slate-300">
              Ask in plain English or Kiswahili — every answer is verified directly against your live sales, M-Pesa, stock, and expense records ·{' '}
              <span className="text-[#2ED3C2] font-semibold">
                {status?.externalLlmEnabled
                  ? `Hybrid AI (${status.externalLlmModel})`
                  : 'Verified Data & Advisory Engine'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              sendQuestion(
                aiLang === 'sw'
                  ? 'Nipe ripoti ya afya ya biashara yangu leo'
                  : 'Give me my executive business health briefing',
              )
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2ED3C2] text-[#041527] text-xs font-bold hover:bg-[#5ce2d4]"
          >
            <Activity className="w-3.5 h-3.5" />
            {aiLang === 'sw' ? 'Ripoti ya Afya (0–100)' : 'Executive Health Briefing'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSim((s) => !s);
              if (!showSim && !simResult) runSimulation();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#2ED3C2]/40 bg-white/5 text-white text-xs font-semibold hover:bg-white/10"
          >
            <Sliders className="w-3.5 h-3.5 text-[#2ED3C2]" />
            {showSim ? 'Hide What-If Simulator' : 'What-If Simulator'}
          </button>
        </div>
      </div>

      {/* Interactive What-If Financial Scenario Simulator */}
      {showSim && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#041527]">Interactive What-If Financial Scenario Simulator</h2>
              <p className="text-xs text-slate-500">
                Test pricing, volume, cost-cutting, and stockout-recovery moves on your trailing 30-day actuals before executing.
              </p>
            </div>
            <button type="button" onClick={() => setShowSim(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: 'priceChangePct', label: 'Price Adjustment', min: -25, max: 30, unit: '%' },
              { key: 'volumeChangePct', label: 'Order Volume Lift', min: -25, max: 40, unit: '%' },
              { key: 'expenseChangePct', label: 'Expense Change', min: -40, max: 25, unit: '%' },
              { key: 'stockoutRecoveryPct', label: 'Stockout Recovery', min: 0, max: 20, unit: '%' },
            ].map((s) => (
              <div key={s.key} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-2">
                  <span>{s.label}</span>
                  <span className="text-teal-700">
                    {(simInputs as any)[s.key] >= 0 ? '+' : ''}
                    {(simInputs as any)[s.key]}
                    {s.unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  value={(simInputs as any)[s.key]}
                  onChange={(e) => setSimInputs({ ...simInputs, [s.key]: Number(e.target.value) })}
                  className="w-full accent-teal-600"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={simLoading}
              onClick={runSimulation}
              className="px-4 py-2 rounded-lg bg-[#041527] text-[#2ED3C2] text-xs font-bold hover:bg-navy-800 disabled:opacity-50"
            >
              {simLoading ? 'Calculating...' : 'Run Scenario Projection'}
            </button>

            {simResult?.simulation && (
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="px-3 py-1.5 rounded-lg bg-slate-100">
                  <span className="text-slate-500">Current Net/Mo:</span>{' '}
                  <strong className="text-navy-950">{formatKes(simResult.simulation.baseline.monthly_net_profit)}</strong>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200">
                  <span className="text-teal-800">Projected Net/Mo:</span>{' '}
                  <strong className="text-teal-900">{formatKes(simResult.simulation.projected.monthly_net_profit)}</strong>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-[#041527] text-white">
                  <span className="text-slate-300">Annualized Impact:</span>{' '}
                  <strong className="text-[#2ED3C2]">
                    {simResult.simulation.impact.annualized_profit_delta >= 0 ? '+' : ''}
                    {formatKes(simResult.simulation.impact.annualized_profit_delta)}
                  </strong>
                </div>
              </div>
            )}
          </div>
          {simResult && !simResult.hasBaselineData && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Import or record sales &amp; expenses in <strong>BizWave Analytics</strong> to project real KES numbers.
            </p>
          )}
        </div>
      )}

      {/* Main Conversational Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[68vh]">
        {/* Thread History Sidebar */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={startNewConversation}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#041527] text-[#2ED3C2] text-xs font-bold hover:bg-navy-800"
          >
            <Plus className="w-4 h-4" /> New Analysis Thread
          </button>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setAiLang('en')}
              className={`flex-1 py-1.5 rounded-md ${aiLang === 'en' ? 'bg-white text-navy-950 shadow-sm' : 'text-slate-500'}`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setAiLang('sw')}
              className={`flex-1 py-1.5 rounded-md ${aiLang === 'sw' ? 'bg-white text-navy-950 shadow-sm' : 'text-slate-500'}`}
            >
              Kiswahili
            </button>
          </div>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 pt-1">Recent Threads</div>
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectConversation(c.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate transition-colors ${
                  activeConvId === c.id ? 'bg-teal-50 text-teal-900 font-semibold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Stream */}
        <div className="lg:col-span-9 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-navy-950">Ask in simple English or Kiswahili</span>
            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
              <Database className="w-3 h-3 text-teal-600" /> Zero-Hallucination SQL Grounding · Tenant Isolated
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5 max-h-[55vh]">
            {messages.length === 0 ? (
              <div className="py-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#041527] text-[#2ED3C2] flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-navy-950">
                    {aiLang === 'sw' ? `Uliza chochote kuhusu ${activeOrg?.display_name}` : `Ask anything about ${activeOrg?.display_name}`}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
                    {aiLang === 'sw'
                      ? 'BizWave AI inachambua rekodi zako halisi za mauzo, M-Pesa, stoo, gharama na wateja ili kutoa majibu na hatua za ukuaji.'
                      : 'BizWave AI runs authorized queries on your live sales, M-Pesa records, stock, expenses, and forecasts to explain what happened, why, and what to do next.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto pt-2 text-left">
                  {promptChips.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendQuestion(q)}
                      className="p-3 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 text-xs font-medium text-slate-700 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-3xl rounded-2xl px-4 py-3.5 text-sm space-y-3 ${
                      m.role === 'user'
                        ? 'bg-[#041527] text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-800 w-full'
                    }`}
                  >
                    <div className="whitespace-pre-line leading-relaxed">
                      {m.content.split(/\*\*(.*?)\*\*/g).map((part: string, idx: number) =>
                        idx % 2 === 1 ? <strong key={idx}>{part}</strong> : <span key={idx}>{part}</span>,
                      )}
                    </div>

                    {m.role === 'assistant' && m.supporting_data?.kpis?.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {m.supporting_data.kpis.map((k: any, i: number) => (
                          <div key={i} className="p-2.5 rounded-xl bg-white border border-slate-200">
                            <div className="text-[10px] font-semibold uppercase text-slate-400">{k.label}</div>
                            <div className="text-xs font-extrabold text-navy-950 mt-0.5">{k.value}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {m.role === 'assistant' && m.supporting_data?.chart?.data?.length > 0 && (
                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <div className="text-[11px] font-bold text-navy-950 mb-2">{m.supporting_data.chart.title}</div>
                        <div className="h-44">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={m.supporting_data.chart.data}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                              <Tooltip />
                              <Bar dataKey="value" fill="#0D9488" radius={[6, 6, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {m.role === 'assistant' && m.follow_up_questions?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {m.follow_up_questions.map((fq: string) => (
                          <button
                            key={fq}
                            type="button"
                            onClick={() => sendQuestion(fq)}
                            className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-teal-200 text-teal-800 hover:bg-teal-50 font-medium"
                          >
                            {fq}
                          </button>
                        ))}
                      </div>
                    )}

                    {m.role === 'assistant' && m.provenance && (
                      <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                        <span>
                          Provenance: {m.provenance.period} · {m.provenance.branchScope}
                          {m.provenance.synthesisMode ? ` · ${m.provenance.synthesisMode}` : ''}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => speakMessage(m)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${
                              speakingId === m.id
                                ? 'bg-teal-600 text-white border-teal-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:text-navy-950'
                            }`}
                          >
                            <Volume2 className="w-3 h-3" /> {speakingId === m.id ? 'Speaking...' : 'Listen'}
                          </button>
                          {m.id && !String(m.id).startsWith('tmp') && (
                            <>
                              <button
                                type="button"
                                onClick={() => rateMessage(m.id, 1)}
                                className={`p-1 rounded ${m.user_rating === 1 ? 'text-teal-600 bg-teal-50' : 'hover:text-slate-700'}`}
                              >
                                <ThumbsUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => rateMessage(m.id, -1)}
                                className={`p-1 rounded ${m.user_rating === -1 ? 'text-rose-600 bg-rose-50' : 'hover:text-slate-700'}`}
                              >
                                <ThumbsDown className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {error && <div className="mx-5 mb-2 p-2.5 rounded-lg bg-rose-50 text-rose-700 text-xs">{error}</div>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendQuestion();
            }}
            className="p-4 border-t border-slate-100 flex items-center gap-2.5 bg-slate-50/50"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
              placeholder={
                aiLang === 'sw'
                  ? 'Uliza swali la biashara (mf. Kwa nini mauzo yalipungua? au Nikiongeza bei 8%?)...'
                  : 'Ask a business question (e.g. Give me my health briefing, or What if I cut expenses 10%?)...'
              }
              className="flex-1 px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#041527] text-[#2ED3C2] text-sm font-bold hover:bg-navy-800 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> {sending ? 'Analyzing...' : 'Ask AI'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
