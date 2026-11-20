import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  Calculator,
  Database,
  Lock,
  Mic,
  MicOff,
  PieChart as PieChartIcon,
  Plus,
  Send,
  Sliders,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Volume2,
  X,
} from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';
import { formatKes } from '../../i18n/translations';
import { formatCompactAxis, formatKesPrecise } from '../../utils/format';
import { PORTAL_CHART_COLORS } from '../../utils/chart-colors';

export const AiAssistantPage: React.FC = () => {
  const { activeOrg, selectedBranchId, language, hasFeature, hasPermission } = useAuth();
  const [aiLang, setAiLang] = useState<'en' | 'sw'>(language);
  const [conversations, setConversations] = useState<any[]>([]);
  const [suggested, setSuggested] = useState<{ en: string[]; sw: string[] }>({ en: [], sw: [] });
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const scopeVersion = useRef(0);
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  // Interactive What-If Financial Scenario Simulator state
  const [showSim, setShowSim] = useState(false);
  const [simInputs, setSimInputs] = useState({
    priceChangePct: 0,
    volumeChangePct: 0,
    expenseChangePct: 0,
    stockoutRecoveryPct: 0,
  });
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const allowed = hasFeature('ai_assistant');

  const loadConversations = async (selectFirst = false, version = scopeVersion.current) => {
    if (!allowed || !hasPermission('ai:use')) return;
    try {
      const res = await apiRequest('/ai/conversations');
      if (version !== scopeVersion.current) return;
      const branchKey = selectedBranchId === 'all' ? null : selectedBranchId;
      const matching = (res.conversations || []).filter((conversation: any) => (conversation.branch_id || null) === branchKey);
      setConversations(matching);
      setSuggested(res.suggestedQuestions || { en: [], sw: [] });
      if (selectFirst && matching[0]) await selectConversation(matching[0].id, version);
    } catch (e: any) {
      if (version === scopeVersion.current) setError(e.message);
    }
  };

  const selectConversation = async (id: string, version = scopeVersion.current) => {
    setActiveConvId(id);
    try {
      const res = await apiRequest(`/ai/conversations/${id}/messages`);
      if (version === scopeVersion.current) setMessages(res.messages || []);
    } catch (e: any) {
      if (version === scopeVersion.current) { setMessages([]); setError(e.message); }
    }
  };

  const startNewConversation = async () => {
    const version = scopeVersion.current;
    const res = await apiRequest('/ai/conversations', {
      method: 'POST', body: { language: aiLang, branchId: selectedBranchId },
    });
    if (version !== scopeVersion.current) throw new Error('The selected business or branch changed.');
    setConversations((prev) => [res.conversation, ...prev]);
    setActiveConvId(res.conversation.id);
    setMessages([]);
    return res.conversation.id as string;
  };

  useEffect(() => {
    const version = ++scopeVersion.current;
    setConversations([]); setActiveConvId(null); setMessages([]); setSimResult(null); setShowSim(false); setError('');
    loadConversations(true, version);
    return () => { scopeVersion.current++; };
  }, [activeOrg?.id, selectedBranchId]);

  useEffect(() => { setAiLang(language); }, [language]);
  useEffect(() => () => { if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.abort(); } }, []);

  const toggleDictation = () => {
    if (listening && recognitionRef.current) { recognitionRef.current.stop(); return; }
    if (!SpeechRecognition) { setError(aiLang === 'sw' ? 'Kivinjari hiki hakiruhusu kuandika kwa sauti.' : 'Voice input is not available in this browser.'); return; }
    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = aiLang === 'sw' ? 'sw-KE' : 'en-KE';
      recognition.interimResults = false;
      recognition.onresult = (event: any) => {
        const spoken = Array.from(event.results as any[]).map((result: any) => result[0]?.transcript || '').join(' ').trim();
        if (spoken) setInput((current) => `${current}${current ? ' ' : ''}${spoken}`);
      };
      recognition.onerror = (event: any) => { setError(event.error === 'not-allowed' ? (aiLang === 'sw' ? 'Ruhusu matumizi ya kipaza sauti kwenye kivinjari.' : 'Allow microphone access in your browser.') : (aiLang === 'sw' ? 'Sauti haikuweza kusomwa. Jaribu tena au andika swali.' : 'Voice input could not be read. Try again or type your question.')); setListening(false); };
      recognition.onend = () => { setListening(false); recognitionRef.current = null; };
      setError(''); recognition.start(); setListening(true);
    } catch { setListening(false); setError(aiLang === 'sw' ? 'Imeshindikana kutumia kipaza sauti.' : 'Could not start the microphone.'); }
  };

  const runSimulation = async () => {
    if (!hasPermission('finance:read') || !hasPermission('sales:read')) { setError('Your role cannot access financial scenarios.'); return; }
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
    const version = scopeVersion.current;
    const temporaryId = `tmp-${Date.now()}`;
    setSending(true);
    setError('');
    setInput('');
    try {
      let cid = activeConvId;
      if (!cid) cid = await startNewConversation();
      setMessages((prev) => [...prev, { id: temporaryId, role: 'user', content: q, language: aiLang }]);
      const res = await apiRequest(`/ai/conversations/${cid}/messages`, {
        method: 'POST',
        body: { content: q, language: aiLang, branchId: selectedBranchId },
      });
      if (version !== scopeVersion.current) return;
      setMessages((prev) => [...prev, res.assistantMessage]);
      loadConversations(false, version);
    } catch (e: any) {
      if (version === scopeVersion.current) { setMessages((prev) => prev.filter((message) => message.id !== temporaryId)); setInput(q); setError(e.message); }
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
        body: { text: msg.content, language: msg.language === 'sw' ? 'sw' : 'en' },
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
        utt.onerror = () => { setSpeakingId(null); setError(aiLang === 'sw' ? 'Imeshindikana kusoma jibu kwa sauti.' : 'Could not play this answer aloud.'); };
        window.speechSynthesis.speak(utt);
      } else {
        setSpeakingId(null);
        setError(aiLang === 'sw' ? 'Kivinjari hiki hakina usomaji wa sauti.' : 'Speech playback is not available in this browser.');
      }
    } catch {
      setSpeakingId(null);
      setError(aiLang === 'sw' ? 'Imeshindikana kusoma jibu kwa sauti.' : 'Could not play this answer aloud.');
    }
  };

  if (!hasPermission('ai:use')) return <div className="p-panel p-7"><h1 className="p-title">{aiLang === 'sw' ? 'Msaidizi wa BizWave' : 'BizWave assistant'}</h1><p className="p-subtitle">{aiLang === 'sw' ? 'Jukumu lako halina ruhusa ya kutumia msaidizi.' : 'Your role does not have access to the assistant.'}</p></div>;

  if (!allowed) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-xl mx-auto text-center space-y-3">
        <Lock className="w-10 h-10 text-amber-500 mx-auto" />
        <h1 className="text-xl font-bold text-navy-950">BizWave AI Requires Intelligence or Enterprise Plan</h1>
        <p className="text-sm text-slate-600">
          Your workspace ({activeOrg?.display_name}) is on the <strong>{activeOrg?.plan_code.toUpperCase()}</strong> plan. AI is not enabled for this plan. Online plan changes are not available yet; contact your administrator.
        </p>
        <Link to="/app/billing" className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-[#041527] text-[#2ED3C2] text-sm font-bold">
          View plan details
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
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#2ED3C2]">{aiLang === 'sw' ? 'ULIZA KUHUSU BIASHARA YAKO' : 'ASK ABOUT YOUR BUSINESS'}</div>
            <h1 className="text-base sm:text-lg font-extrabold text-white">{aiLang === 'sw' ? 'Msaidizi wa BizWave' : 'Your BizWave assistant'}</h1>
            <p className="text-xs text-slate-300">{aiLang === 'sw' ? 'Uliza kwa Kiingereza au Kiswahili. Majibu hutumia rekodi unazoweza kuona; makadirio si uhakika.' : 'Ask in English or Kiswahili. Answers use the records available to your role; estimates are not guarantees.'}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              sendQuestion(
                aiLang === 'sw'
                  ? 'Fanya uchambuzi wa kina wa hesabu za faida na break-even'
                  : 'Run a full Data Scientist audit & break-even calculation',
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2ED3C2] text-[#041527] text-xs font-bold hover:bg-[#5ce2d4]"
          >
            <Calculator className="w-3.5 h-3.5" />
            {aiLang === 'sw' ? 'Hesabu za Data Scientist' : 'Pro Data Scientist Audit'}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              sendQuestion(
                aiLang === 'sw'
                  ? 'Tabiri mauzo yangu ya siku 14 zijazo kwa grafu'
                  : 'Predict my next 14 days sales with a forecast graph',
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2ED3C2]/40 bg-white/5 text-white text-xs font-semibold hover:bg-white/10"
          >
            <TrendingUp className="w-3.5 h-3.5 text-[#2ED3C2]" />
            {aiLang === 'sw' ? 'Grafu ya Utabiri' : 'Forecast Graph'}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              sendQuestion(
                aiLang === 'sw'
                  ? 'Chora chati ya duara ya mauzo ya M-Pesa na pesa taslimu'
                  : 'Draw a pie chart of my M-Pesa vs cash sales',
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2ED3C2]/40 bg-white/5 text-white text-xs font-semibold hover:bg-white/10"
          >
            <PieChartIcon className="w-3.5 h-3.5 text-[#2ED3C2]" />
            {aiLang === 'sw' ? 'Chati ya Duara' : 'Pie Chart'}
          </button>
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
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/20 bg-white/5 text-white text-xs font-semibold hover:bg-white/10"
          >
            <Activity className="w-3.5 h-3.5 text-[#2ED3C2]" />
            {aiLang === 'sw' ? 'Muhtasari' : 'Business summary'}
          </button>
          {hasPermission('finance:read') && hasPermission('sales:read') && <button
            type="button"
            onClick={() => setShowSim((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2ED3C2]/40 bg-white/5 text-white text-xs font-semibold hover:bg-white/10"
          >
            <Sliders className="w-3.5 h-3.5 text-[#2ED3C2]" />
            {showSim ? 'Hide scenario' : 'What if?'}
          </button>}
        </div>
      </div>

      {/* Interactive What-If Financial Scenario Simulator */}
      {showSim && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#041527]">Interactive What-If Financial Scenario Simulator</h2>
              <p className="text-xs text-slate-500">
                Explore an illustrative scenario using recorded sales, costs and expenses from the last 30 days. Results are not a forecast; the model assumes price elasticity of -0.35.
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
            onClick={() => { startNewConversation().catch((e: any) => setError(e.message || 'Could not start a conversation.')); }}
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
              <Database className="w-3 h-3 text-teal-600" /> {aiLang === 'sw' ? 'Hutumia rekodi zinazoruhusiwa' : 'Uses records available to your role'}
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
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="text-[11px] font-bold text-navy-950">{m.supporting_data.chart.title}</div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">
                            {m.supporting_data.chart.type === 'pie'
                              ? (aiLang === 'sw' ? 'Mgawanyo' : 'Distribution')
                              : m.supporting_data.chart.type === 'forecast'
                                ? (aiLang === 'sw' ? 'Makadirio ya mauzo' : 'Sales estimate')
                                : (aiLang === 'sw' ? 'Chati' : 'Chart')}
                          </span>
                        </div>
                        <div className={m.supporting_data.chart.type === 'pie' ? 'h-56' : 'h-52'}>
                          <ResponsiveContainer width="100%" height="100%">
                            {m.supporting_data.chart.type === 'pie' ? (
                              <PieChart>
                                <Pie
                                  data={m.supporting_data.chart.data}
                                  dataKey="value"
                                  nameKey="label"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={44}
                                  outerRadius={76}
                                  paddingAngle={3}
                                  stroke="#142b48"
                                  isAnimationActive={false}
                                >
                                  {m.supporting_data.chart.data.map((_: any, idx: number) => (
                                    <Cell key={idx} fill={PORTAL_CHART_COLORS[idx % PORTAL_CHART_COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(val: any) => formatKes(Number(val))} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                              </PieChart>
                            ) : m.supporting_data.chart.type === 'forecast' ? (
                              <AreaChart data={m.supporting_data.chart.data.map((point: any) => ({ ...point, predicted: point.is_forecast ? point.predicted : null, band: point.lower_80 != null && point.upper_80 != null ? [Number(point.lower_80), Number(point.upper_80)] : null }))}>
                                <defs>
                                  <linearGradient id={`fcBand-${m.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2ED3C2" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#2ED3C2" stopOpacity={0.04} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => String(v).slice(5)} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatCompactAxis} />
                                <Tooltip formatter={(val: any) => val == null ? '—' : Array.isArray(val) ? `${formatKesPrecise(val[0])} – ${formatKesPrecise(val[1])}` : formatKesPrecise(val)} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Area isAnimationActive={false} type="monotone" dataKey="band" name={aiLang === 'sw' ? 'Wigo wa makadirio' : 'Approximate range'} stroke="none" fill={`url(#fcBand-${m.id})`} />
                                <Area isAnimationActive={false} type="monotone" dataKey="actual" name={aiLang === 'sw' ? 'Mauzo halisi' : 'Recorded sales'} stroke="#a6f7ff" strokeWidth={2.5} fill="none" connectNulls />
                                <Area isAnimationActive={false} type="monotone" dataKey="predicted" name={aiLang === 'sw' ? 'Utabiri' : 'Forecast'} stroke="#69ddff" strokeWidth={2.5} strokeDasharray="5 3" fill="none" connectNulls />
                              </AreaChart>
                            ) : (
                              <BarChart data={m.supporting_data.chart.data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                                <Tooltip formatter={(val: any) => formatKes(Number(val))} />
                                <Bar isAnimationActive={false} dataKey="value" fill="#69ddff" radius={[6, 6, 0, 0]} />
                              </BarChart>
                            )}
                          </ResponsiveContainer>
                        </div>
                        {m.supporting_data.chart.type === 'forecast' && <p className="mt-2 text-[10px] text-slate-400">{aiLang === 'sw' ? 'Wigo ni makadirio, si uwezekano uliothibitishwa; utabiri unaweza kukosea.' : 'The range is approximate, not a validated probability; forecasts can be wrong.'}</p>}
                      </div>
                    )}

                    {m.role === 'assistant' && m.supporting_data?.calculations?.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-navy-950">
                          <Calculator className="w-3.5 h-3.5 text-teal-600" />
                          Calculations &amp; formulas
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {m.supporting_data.calculations.slice(0, 8).map((c: any, idx: number) => (
                            <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-navy-950">{c.metric}</span>
                                <span className="text-[11px] font-extrabold text-teal-700">{c.formatted}</span>
                              </div>
                              <div className="text-[10px] font-mono text-slate-500 mt-0.5 break-all">{c.formula}</div>
                              {c.interpretation && <div className="text-[10px] text-slate-600 mt-0.5">{c.interpretation}</div>}
                            </div>
                          ))}
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
                            <Volume2 className="w-3 h-3" /> {speakingId === m.id ? (aiLang === 'sw' ? 'Inasoma...' : 'Speaking...') : (aiLang === 'sw' ? 'Sikiliza' : 'Listen')}
                          </button>
                          {m.id && !String(m.id).startsWith('tmp') && (
                            <>
                              <button
                                type="button"
                                onClick={() => rateMessage(m.id, 1)}
                                aria-label={aiLang === 'sw' ? 'Jibu limenisaidia' : 'Helpful answer'}
                                className={`p-1 rounded ${m.user_rating === 1 ? 'text-teal-600 bg-teal-50' : 'hover:text-slate-700'}`}
                              >
                                <ThumbsUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => rateMessage(m.id, -1)}
                                aria-label={aiLang === 'sw' ? 'Jibu halikunisaidia' : 'Not helpful'}
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
              aria-label={aiLang === 'sw' ? 'Swali lako' : 'Your question'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
              placeholder={
                aiLang === 'sw'
                  ? 'Uliza swali la biashara (mf. Kwa nini mauzo yalipungua? au Nikiongeza bei 8%?)...'
                  : 'Ask a business question (e.g. Give me my health briefing, or What if I cut expenses 10%?)...'
              }
              className="flex-1 min-w-0 px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600"
            />
            <button type="button" onClick={toggleDictation} disabled={sending || !SpeechRecognition}
              className="p-2.5 rounded-xl border border-slate-200 text-teal-600 disabled:opacity-50"
              aria-label={listening ? (aiLang === 'sw' ? 'Simamisha kipaza sauti' : 'Stop microphone') : (aiLang === 'sw' ? 'Tumia sauti kuuliza' : 'Dictate a question')}
              title={!SpeechRecognition ? 'Voice input is not supported by this browser' : 'Dictate a question'}>
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#041527] text-[#2ED3C2] text-sm font-bold hover:bg-navy-800 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> <span className="hidden sm:inline">{sending ? (aiLang === 'sw' ? 'Inachambua...' : 'Analyzing...') : (aiLang === 'sw' ? 'Uliza' : 'Ask')}</span>
            </button>
          </form>
          <p className="px-4 pb-3 text-[10px] text-slate-400">{aiLang === 'sw' ? 'Kuandika kwa sauti hutegemea kivinjari chako na ruhusa ya kipaza sauti.' : 'Voice input is provided by your browser and requires microphone permission.'}</p>
        </div>
      </div>
    </div>
  );
};
