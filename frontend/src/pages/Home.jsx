import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/* ─────────────────────────────────────────────────────────────────────────────
   HOOK – fires once when element enters viewport
───────────────────────────────────────────────────────────────────────────── */
function useVisible(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

/* ─────────────────────────────────────────────────────────────────────────────
   DATA
───────────────────────────────────────────────────────────────────────────── */
const FEATURES = [
  {
    accent: '#3B82F6',
    title: 'Real-Time AI Detection',
    desc: 'Multi-model inference identifies abuse, theft, and health emergencies from live feeds in under 2 seconds.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
      </svg>
    ),
  },
  {
    accent: '#10B981',
    title: 'Blockchain Evidence Chain',
    desc: 'Every incident frame is hashed on-chain the moment it is captured — tamper-proof, court-admissible records.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
      </svg>
    ),
  },
  {
    accent: '#F59E0B',
    title: 'Instant Alert Dispatch',
    desc: 'Role-based routing sends context-rich alerts to security, medical, and management the moment a threat is confirmed.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
      </svg>
    ),
  },
  {
    accent: '#8B5CF6',
    title: 'Analytics & Heatmaps',
    desc: 'Incident heatmaps, trend analysis, and exportable reports give leadership full situational awareness.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
      </svg>
    ),
  },
  {
    accent: '#EF4444',
    title: 'Role-Based Access Control',
    desc: 'Granular permissions keep sensitive footage and evidence locked to the right eyes — no exceptions.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
    ),
  },
  {
    accent: '#06B6D4',
    title: 'Hybrid Edge + Cloud',
    desc: 'On-device inference for ultra-low latency; cloud aggregation for multi-site oversight and long-term archival.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
    ),
  },
];

const STATS = [
  { value: '< 2s',    label: 'Detection Latency' },
  { value: '99.4%',  label: 'Platform Uptime' },
  { value: '256-bit', label: 'AES Encryption' },
  { value: '∞',      label: 'Blockchain Immutability' },
];

const PIPELINE = [
  { n: '01', label: 'Live Camera Ingestion',      color: '#3B82F6' },
  { n: '02', label: 'AI Inference Engine',         color: '#8B5CF6' },
  { n: '03', label: 'Role-Based Alert Dispatch',  color: '#F59E0B' },
  { n: '04', label: 'Blockchain Evidence Anchor', color: '#10B981' },
];

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────────── */
function HomePage() {
  const [statsRef,    statsVis]    = useVisible(0.1);
  const [featuresRef, featuresVis] = useVisible(0.05);
  const [overviewRef, overviewVis] = useVisible(0.1);
  const [previewRef,  previewVis]  = useVisible(0.1);
  const [ctaRef,      ctaVis]      = useVisible(0.1);

  return (
    <>
      {/* ── FONTS + GLOBAL STYLES ─────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800;900&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap');

        html, body { scroll-behavior: smooth; margin: 0; padding: 0; }

        .hp-root {
          font-family: 'Sora', system-ui, sans-serif;
          background: #0D1117;
          color: #F9FAFB;
          overflow-x: hidden;
          /* CHANGE 2: root covers full viewport, no clipping */
          width: 100%;
          min-height: 100vh;
          box-sizing: border-box;
        }

        /* CHANGE 2: grid-bg uses background-attachment:fixed so it covers
           100vw × 100vh and never shows side gaps regardless of content width */
        .grid-bg {
          background-image:
            linear-gradient(rgba(59,130,246,0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.055) 1px, transparent 1px);
          background-size: 52px 52px;
          background-attachment: fixed;
          width: 100%;
        }

        /* ── CHANGE 1: fixed navbar with Register + Login ── */
        .hp-navbar {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 999;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          height: 64px;
          background: rgba(13,17,23,0.85);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          box-sizing: border-box;
        }
        .hp-nav-logo {
          font-family: 'Sora', system-ui, sans-serif;
          font-size: 1rem;
          font-weight: 700;
          color: #F9FAFB;
          letter-spacing: -0.01em;
          text-decoration: none;
        }
        .hp-nav-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        /* Register — secondary ghost, same sizing as Login */
        .btn-nav-register {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.18);
          color: #F9FAFB;
          font-family: 'Sora', system-ui, sans-serif;
          font-weight: 700;
          font-size: 0.875rem;
          padding: 9px 22px;
          border-radius: 10px;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s, border-color 0.2s;
          white-space: nowrap;
        }
        .btn-nav-register:hover {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.3);
          transform: translateY(-1px);
        }
        /* Login — primary blue, matching btn-p style */
        .btn-nav-login {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #3B82F6;
          border: 1px solid #3B82F6;
          color: #fff;
          font-family: 'Sora', system-ui, sans-serif;
          font-weight: 700;
          font-size: 0.875rem;
          padding: 9px 22px;
          border-radius: 10px;
          text-decoration: none;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(59,130,246,0.4);
          transition: background 0.2s, box-shadow 0.2s, transform 0.15s;
          white-space: nowrap;
        }
        .btn-nav-login:hover {
          background: #2563EB;
          box-shadow: 0 6px 32px rgba(59,130,246,0.6);
          transform: translateY(-1px);
        }

        /* ── scroll reveal ── */
        .reveal { opacity:0; transform:translateY(36px); transition:opacity .75s cubic-bezier(.22,1,.36,1), transform .75s cubic-bezier(.22,1,.36,1); }
        .reveal.on { opacity:1; transform:translateY(0); }
        .reveal.on > *:nth-child(1){ transition-delay:.05s }
        .reveal.on > *:nth-child(2){ transition-delay:.13s }
        .reveal.on > *:nth-child(3){ transition-delay:.21s }
        .reveal.on > *:nth-child(4){ transition-delay:.29s }
        .reveal.on > *:nth-child(5){ transition-delay:.37s }
        .reveal.on > *:nth-child(6){ transition-delay:.45s }

        /* ── blob ── */
        .blob { position:absolute; border-radius:50%; filter:blur(110px); pointer-events:none; }

        /* ── badge ── */
        .badge {
          display:inline-flex; align-items:center; gap:7px;
          background:rgba(59,130,246,.11); border:1px solid rgba(59,130,246,.28);
          color:#93C5FD; padding:4px 14px; border-radius:100px;
          font-size:.72rem; font-weight:600; letter-spacing:.07em;
          text-transform:uppercase; font-family:'DM Mono',monospace;
        }
        .badge-dot { width:6px; height:6px; border-radius:50%; background:#10B981; display:inline-block; }

        /* ── primary button ── */
        .btn-p {
          display:inline-block; background:#3B82F6; color:#fff;
          font-weight:700; padding:14px 36px; border-radius:10px;
          font-size:1rem; text-decoration:none;
          box-shadow:0 4px 28px rgba(59,130,246,.38);
          transition:background .2s, box-shadow .2s, transform .15s;
        }
        .btn-p:hover { background:#2563EB; box-shadow:0 8px 40px rgba(59,130,246,.55); transform:translateY(-2px); }

        /* ── secondary button ── */
        .btn-s {
          display:inline-block; background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.13); color:#F9FAFB;
          font-weight:700; padding:14px 36px; border-radius:10px;
          font-size:1rem; text-decoration:none;
          transition:background .2s, transform .15s;
        }
        .btn-s:hover { background:rgba(255,255,255,.11); transform:translateY(-2px); }

        /* ── feature card ── */
        .feat-card {
          background:rgba(255,255,255,.03);
          border:1px solid rgba(255,255,255,.07);
          border-radius:16px; padding:28px 24px;
          position:relative; overflow:hidden;
          transition:transform .3s ease, box-shadow .3s ease, border-color .3s ease;
        }
        .feat-card::before {
          content:''; position:absolute; inset:0; border-radius:16px;
          background:radial-gradient(circle at 50% 0%, var(--ac) 0%, transparent 65%);
          opacity:0; transition:opacity .3s;
        }
        .feat-card:hover { transform:translateY(-6px); box-shadow:0 24px 64px rgba(0,0,0,.55); border-color:rgba(255,255,255,.16); }
        .feat-card:hover::before { opacity:.07; }

        /* ── stat card ── */
        .stat-card {
          background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08);
          border-radius:14px; padding:28px 20px; text-align:center;
          transition:transform .3s;
        }
        .stat-card:hover { transform:translateY(-4px); }

        /* ── pipeline step ── */
        .pipe-step {
          display:flex; align-items:center; gap:16px;
          padding:15px 20px; border-radius:12px;
          background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
          transition:border-color .3s;
        }

        /* ── camera tile ── */
        .cam-tile { border-radius:8px; position:relative; overflow:hidden; aspect-ratio:16/9; }

        /* scan line animation */
        @keyframes scan { 0%{transform:translateY(-100%)} 100%{transform:translateY(500%)} }
        .scanline { animation:scan 3s linear infinite; position:absolute; left:0; right:0; height:18%; background:linear-gradient(to bottom,transparent,rgba(59,130,246,.09),transparent); pointer-events:none; }

        /* pulse rec dot */
        @keyframes pulse-out { 0%{transform:scale(1);opacity:.9} 100%{transform:scale(2.4);opacity:0} }
        .rec-ring::after { content:''; position:absolute; inset:0; border-radius:50%; background:#EF4444; animation:pulse-out 1.5s ease-out infinite; }

        /* divider */
        .divider { height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent); }

        /* mono label */
        .mono { font-family:'DM Mono', monospace; }

        /* responsive */
        @media(max-width:900px){
          .two-col { grid-template-columns:1fr !important; gap:48px !important; }
          .feat-grid { grid-template-columns:1fr !important; }
          .stats-grid { grid-template-columns:repeat(2,1fr) !important; }
          .cam-grid { grid-template-columns:1fr 1fr !important; }
          .dash-sidebar { display:none !important; }
          .hp-navbar { padding: 0 20px; }
        }
        @media(max-width:600px){
          .stats-grid { grid-template-columns:1fr 1fr !important; }
          .cta-btns { flex-direction:column !important; align-items:center !important; }
          .btn-nav-register, .btn-nav-login { padding: 8px 14px; font-size: 0.8rem; }
        }
      `}</style>

      <div className="hp-root">

        {/* ════════════════════════════════════════════════════════════════
            CHANGE 1: NAVBAR — Register (secondary) + Login (primary)
        ════════════════════════════════════════════════════════════════ */}
        <nav className="hp-navbar">
          <span className="hp-nav-logo">AI-CCTV System</span>
          <div className="hp-nav-actions">
            <Link to="/register" className="btn-nav-register">Register</Link>
            <Link to="/login"    className="btn-nav-login">Login</Link>
          </div>
        </nav>

        {/* ════════════════════════════════════════════════════════════════
            HERO
            CHANGE 2: padding-top = 144px (64px navbar + 80px original top)
                      so content is never hidden under the fixed navbar
        ════════════════════════════════════════════════════════════════ */}
        <section
          className="grid-bg"
          style={{
            minHeight: '100vh',
            display: 'flex', alignItems: 'center',
            padding: '144px 24px 96px',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* ambient blobs */}
          <div className="blob" style={{ width:700, height:700, background:'rgba(59,130,246,.14)', top:-280, left:-220, zIndex:0 }} />
          <div className="blob" style={{ width:500, height:500, background:'rgba(139,92,246,.1)', bottom:-160, right:-160, zIndex:0 }} />

          <div style={{ width:'100%', position:'relative', zIndex:1 }}>
          <div style={{ maxWidth:1240, margin:'0 auto', width:'100%' }}>
            <div className="two-col" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:72, alignItems:'center' }}>

              {/* ── LEFT ── */}
              <div>
                <div className="badge" style={{ marginBottom:28 }}>
                  <span className="badge-dot" />
                  Live Monitoring · AI-Powered · Blockchain Secured
                </div>

                <h1 style={{
                  fontSize:'clamp(2.5rem,5.5vw,4rem)',
                  fontWeight:900, lineHeight:1.08,
                  letterSpacing:'-.035em', marginBottom:24,
                }}>
                  AI-Powered<br />
                  <span style={{ color:'#3B82F6' }}>Hybrid CCTV</span><br />
                  Security System
                </h1>

                <p style={{ fontSize:'1.1rem', color:'#9CA3AF', lineHeight:1.8, marginBottom:40, maxWidth:460 }}>
                  Proactive monitoring and rapid response for abuse, theft, and health
                  emergencies — secured with blockchain for tamper-proof evidence you
                  can trust in court.
                </p>

                <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                  <Link to="/dashboard" className="btn-p">View Dashboard</Link>
                  <Link to="/incidents" className="btn-s">Browse Incidents</Link>
                </div>

                {/* trust strip */}
                <div style={{ display:'flex', gap:28, marginTop:44, flexWrap:'wrap' }}>
                  {['SOC 2 Compliant','GDPR Ready','99.4% Uptime'].map(t => (
                    <div key={t} style={{ display:'flex', alignItems:'center', gap:7, color:'#6B7280', fontSize:'.82rem' }}>
                      <svg viewBox="0 0 20 20" fill="#10B981" width={13} height={13}>
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                      {t}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── RIGHT — CCTV monitor ── */}
              <div style={{ position:'relative' }}>
                {/* monitor frame */}
                <div style={{
                  background:'#080D14', border:'1px solid rgba(255,255,255,.1)',
                  borderRadius:20, padding:16,
                  boxShadow:'0 40px 120px rgba(0,0,0,.85), 0 0 0 1px rgba(59,130,246,.09)',
                }}>
                  {/* title bar */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                    {['#EF4444','#F59E0B','#10B981'].map(c => (
                      <div key={c} style={{ width:9, height:9, borderRadius:'50%', background:c, opacity:.85 }} />
                    ))}
                    <span style={{ flex:1, textAlign:'center', fontSize:'.65rem', color:'#374151' }} className="mono">
                      LIVE MONITOR — 4 CAMERAS ACTIVE
                    </span>
                    <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'.62rem', color:'#EF4444' }} className="mono">
                      <span className="rec-ring" style={{ position:'relative', width:7, height:7, borderRadius:'50%', background:'#EF4444', display:'inline-block', flexShrink:0 }} />
                      REC
                    </div>
                  </div>

                  {/* 4-camera grid */}
                  <div className="cam-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                    {[
                      { label:'CAM 01 · LOBBY',    bg:'#141C2B', alert:false, scan:true  },
                      { label:'CAM 02 · PARKING',  bg:'#150E1E', alert:true,  scan:false },
                      { label:'CAM 03 · CORRIDOR', bg:'#0F1922', alert:false, scan:false },
                      { label:'CAM 04 · EXIT',     bg:'#141A20', alert:false, scan:false },
                    ].map((cam, i) => (
                      <div
                        key={i} className="cam-tile"
                        style={{
                          background: cam.bg,
                          border: cam.alert ? '1.5px solid #EF4444' : '1px solid rgba(255,255,255,.05)',
                        }}
                      >
                        {[...Array(5)].map((_,j) => (
                          <div key={j} style={{ position:'absolute', left:0, right:0, top:`${j*22}%`, height:1, background:'rgba(255,255,255,.03)' }} />
                        ))}
                        {cam.scan && <div className="scanline" />}
                        {cam.alert && (
                          <div style={{
                            position:'absolute', top:'18%', left:'28%', width:'38%', height:'58%',
                            border:'1.5px solid #EF4444', borderRadius:4,
                          }}>
                            <div style={{
                              position:'absolute', top:-17, left:0,
                              background:'#EF4444', color:'#fff', fontSize:'.48rem',
                              padding:'1px 5px', borderRadius:3, whiteSpace:'nowrap',
                            }} className="mono">THREAT 96%</div>
                          </div>
                        )}
                        <div style={{ position:'absolute', bottom:5, left:7, fontSize:'.48rem', color:'#374151' }} className="mono">
                          {cam.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* status bar */}
                  <div style={{
                    display:'flex', justifyContent:'space-between', marginTop:10,
                    paddingTop:9, borderTop:'1px solid rgba(255,255,255,.05)',
                    fontSize:'.6rem', color:'#374151',
                  }} className="mono">
                    <span style={{ color:'#EF4444' }}>● 1 ALERT ACTIVE</span>
                    <span>AI ENGINE: RUNNING</span>
                    <span>CHAIN: SYNCED ✓</span>
                  </div>
                </div>

                {/* floating alert card */}
                <div style={{
                  position:'absolute', bottom:-28, left:-36,
                  background:'rgba(10,14,22,.96)', border:'1px solid rgba(239,68,68,.3)',
                  borderRadius:13, padding:'12px 16px',
                  display:'flex', alignItems:'center', gap:12,
                  boxShadow:'0 12px 48px rgba(0,0,0,.7)', minWidth:210,
                }}>
                  <div style={{
                    width:36, height:36, borderRadius:10, background:'rgba(239,68,68,.13)',
                    display:'flex', alignItems:'center', justifyContent:'center', color:'#EF4444', flexShrink:0,
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={17} height={17}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize:'.75rem', fontWeight:600, color:'#F9FAFB' }}>Threat Detected</div>
                    <div style={{ fontSize:'.62rem', color:'#4B5563', marginTop:2 }} className="mono">CAM 02 · PARKING · just now</div>
                  </div>
                </div>

                {/* floating chain card */}
                <div style={{
                  position:'absolute', top:-22, right:-30,
                  background:'rgba(10,14,22,.96)', border:'1px solid rgba(16,185,129,.28)',
                  borderRadius:12, padding:'10px 15px',
                  boxShadow:'0 10px 40px rgba(0,0,0,.6)',
                }}>
                  <div style={{ fontSize:'.62rem', color:'#10B981', marginBottom:3 }} className="mono">HASH ANCHORED ✓</div>
                  <div style={{ fontSize:'.58rem', color:'#374151' }} className="mono">0x3f7a…c91e</div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            STATS
        ════════════════════════════════════════════════════════════════ */}
        <div className="divider" />
        <section ref={statsRef} style={{ padding:'64px 24px', background:'rgba(255,255,255,.012)' }}>
          <div
            className={`reveal ${statsVis ? 'on' : ''}`}
            style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:20, maxWidth:1000, margin:'0 auto' }}
          >
            {STATS.map(s => (
              <div key={s.label} className="stat-card stats-grid">
                <div style={{ fontSize:'2.5rem', fontWeight:900, color:'#3B82F6', letterSpacing:'-.04em', marginBottom:6 }}>{s.value}</div>
                <div style={{ fontSize:'.72rem', color:'#6B7280', letterSpacing:'.06em', textTransform:'uppercase' }} className="mono">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
        <div className="divider" />

        {/* ════════════════════════════════════════════════════════════════
            OVERVIEW
        ════════════════════════════════════════════════════════════════ */}
        <section ref={overviewRef} style={{ padding:'104px 24px', width:'100%' }}>
        <div style={{ maxWidth:1240, margin:'0 auto' }}>
          <div className={`two-col reveal ${overviewVis ? 'on' : ''}`} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:80, alignItems:'center' }}>
            <div>
              <div className="badge" style={{ marginBottom:22 }}>Platform Overview</div>
              <h2 style={{ fontSize:'clamp(1.9rem,3.5vw,2.9rem)', fontWeight:800, lineHeight:1.18, letterSpacing:'-.03em', marginBottom:20 }}>
                From raw footage to<br />
                <span style={{ color:'#3B82F6' }}>actionable intelligence</span>
              </h2>
              <p style={{ color:'#9CA3AF', lineHeight:1.85, marginBottom:18 }}>
                Traditional CCTV systems record passively — ours acts. Our multi-layer AI
                stack continuously analyzes every frame for anomalies, cross-referencing
                behavioral signals to minimize false positives while maximizing detection speed.
              </p>
              <p style={{ color:'#9CA3AF', lineHeight:1.85 }}>
                When an incident is detected, the system simultaneously alerts the right
                personnel, captures forensic-grade evidence, and writes an immutable blockchain
                record — an unbroken chain of custody from first frame to final resolution.
              </p>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {PIPELINE.map((p, i) => (
                <div
                  key={i} className="pipe-step"
                  onMouseEnter={e => e.currentTarget.style.borderColor = p.color + '55'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'}
                >
                  <div style={{ width:28, fontSize:'.68rem', color:p.color, flexShrink:0 }} className="mono">{p.n}</div>
                  <div style={{ flex:1, fontSize:'.95rem', fontWeight:500 }}>{p.label}</div>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:p.color, opacity:.7 }} />
                </div>
              ))}
              <div style={{ paddingLeft:44, marginTop:6 }}>
                <span style={{
                  display:'inline-block', fontSize:'.67rem', color:'#10B981',
                  background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.22)',
                  borderRadius:100, padding:'3px 12px',
                }} className="mono">✓ Full pipeline under 2 seconds</span>
              </div>
            </div>
          </div>
        </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            FEATURES
        ════════════════════════════════════════════════════════════════ */}
        <div className="divider" />
        <section
          ref={featuresRef}
          style={{ padding:'104px 24px', background:'rgba(255,255,255,.012)', position:'relative', overflow:'hidden' }}
        >
          <div className="blob" style={{ width:500, height:500, background:'rgba(59,130,246,.06)', top:-160, right:-160, zIndex:0 }} />
          <div style={{ maxWidth:1240, margin:'0 auto', position:'relative', zIndex:1 }}>
            <div style={{ textAlign:'center', marginBottom:64 }}>
              <div className="badge" style={{ margin:'0 auto 20px' }}>Core Capabilities</div>
              <h2 style={{ fontSize:'clamp(1.9rem,3.5vw,2.9rem)', fontWeight:800, letterSpacing:'-.03em', marginBottom:14 }}>
                Everything security operations need
              </h2>
              <p style={{ color:'#6B7280', maxWidth:500, margin:'0 auto', lineHeight:1.75 }}>
                Built for high-stakes environments where every second and every frame of footage counts.
              </p>
            </div>
            <div
              className={`feat-grid reveal ${featuresVis ? 'on' : ''}`}
              style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:18 }}
            >
              {FEATURES.map((f, i) => (
                <div key={i} className="feat-card" style={{ '--ac': f.accent }}>
                  <div style={{
                    width:48, height:48, borderRadius:13,
                    background:`${f.accent}1A`, border:`1px solid ${f.accent}33`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:f.accent, marginBottom:18,
                  }}>
                    {f.icon}
                  </div>
                  <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:10 }}>{f.title}</h3>
                  <p style={{ fontSize:'.875rem', color:'#6B7280', lineHeight:1.75 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <div className="divider" />

        {/* ════════════════════════════════════════════════════════════════
            DASHBOARD PREVIEW
        ════════════════════════════════════════════════════════════════ */}
        <section ref={previewRef} style={{ padding:'104px 24px', width:'100%' }}>
        <div style={{ maxWidth:1240, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:56 }}>
            <div className="badge" style={{ margin:'0 auto 20px' }}>Dashboard Preview</div>
            <h2 style={{ fontSize:'clamp(1.9rem,3.5vw,2.9rem)', fontWeight:800, letterSpacing:'-.03em' }}>
              Command center at a glance
            </h2>
          </div>
          <div className={`reveal ${previewVis ? 'on' : ''}`}>
            <div style={{
              background:'#080D14', border:'1px solid rgba(255,255,255,.09)',
              borderRadius:20, overflow:'hidden',
              boxShadow:'0 60px 160px rgba(0,0,0,.9), 0 0 0 1px rgba(59,130,246,.07)',
            }}>
              {/* chrome bar */}
              <div style={{
                padding:'11px 18px', background:'rgba(255,255,255,.025)',
                borderBottom:'1px solid rgba(255,255,255,.07)',
                display:'flex', alignItems:'center', gap:10,
              }}>
                <div style={{ display:'flex', gap:6 }}>
                  {['#EF4444','#F59E0B','#10B981'].map(c => (
                    <div key={c} style={{ width:10, height:10, borderRadius:'50%', background:c, opacity:.8 }} />
                  ))}
                </div>
                <div style={{ flex:1, textAlign:'center', fontSize:'.68rem', color:'#374151' }} className="mono">
                  dashboard.cctv-ai.internal
                </div>
              </div>
              {/* layout */}
              <div style={{ display:'grid', gridTemplateColumns:'210px 1fr', minHeight:380 }}>
                <div className="dash-sidebar" style={{
                  background:'rgba(255,255,255,.015)', borderRight:'1px solid rgba(255,255,255,.06)',
                  padding:'22px 14px',
                }}>
                  <div style={{ fontSize:'.6rem', color:'#374151', marginBottom:14, letterSpacing:'.09em', textTransform:'uppercase' }} className="mono">Navigation</div>
                  {['Dashboard','Live Cameras','Incidents','Analytics','Evidence Vault','Settings'].map((item, i) => (
                    <div key={item} style={{
                      padding:'9px 12px', borderRadius:8, fontSize:'.8rem', marginBottom:3, cursor:'default',
                      background: i === 0 ? 'rgba(59,130,246,.15)' : 'transparent',
                      color:       i === 0 ? '#93C5FD' : '#374151',
                      border:      i === 0 ? '1px solid rgba(59,130,246,.22)' : '1px solid transparent',
                    }}>{item}</div>
                  ))}
                </div>
                <div style={{ padding:22 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
                    {[
                      { label:'Active Cameras', value:'24',    c:'#3B82F6' },
                      { label:'Open Incidents', value:'3',     c:'#EF4444' },
                      { label:'Resolved Today', value:'11',    c:'#10B981' },
                      { label:'Chain Blocks',   value:'4,821', c:'#F59E0B' },
                    ].map(k => (
                      <div key={k.label} style={{
                        background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)',
                        borderRadius:10, padding:'13px 15px',
                      }}>
                        <div style={{ fontSize:'1.45rem', fontWeight:800, color:k.c, marginBottom:4, letterSpacing:'-.03em' }}>{k.value}</div>
                        <div style={{ fontSize:'.62rem', color:'#374151' }} className="mono">{k.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{
                    background:'rgba(255,255,255,.02)', border:'1px solid rgba(255,255,255,.06)',
                    borderRadius:10, overflow:'hidden',
                  }}>
                    <div style={{
                      display:'grid', gridTemplateColumns:'1fr 1.6fr 1fr 1fr',
                      padding:'9px 16px', borderBottom:'1px solid rgba(255,255,255,.06)',
                      fontSize:'.6rem', color:'#374151', letterSpacing:'.06em', textTransform:'uppercase',
                    }} className="mono">
                      <span>Type</span><span>Location</span><span>Severity</span><span>Status</span>
                    </div>
                    {[
                      { type:'Threat', loc:'CAM 02 · Parking', sev:'HIGH', sc:'#EF4444', stat:'Investigating', stc:'#EF4444', stbg:'rgba(239,68,68,.1)' },
                      { type:'Health', loc:'CAM 07 · Lobby',   sev:'MED',  sc:'#F59E0B', stat:'Resolved',      stc:'#10B981', stbg:'rgba(16,185,129,.1)' },
                      { type:'Theft',  loc:'CAM 14 · Store',   sev:'HIGH', sc:'#EF4444', stat:'Escalated',     stc:'#F59E0B', stbg:'rgba(245,158,11,.1)' },
                    ].map((row, i, arr) => (
                      <div key={i} style={{
                        display:'grid', gridTemplateColumns:'1fr 1.6fr 1fr 1fr',
                        padding:'10px 16px', alignItems:'center',
                        borderBottom: i < arr.length-1 ? '1px solid rgba(255,255,255,.04)' : 'none',
                        fontSize:'.78rem',
                      }}>
                        <span style={{ color:'#D1D5DB', fontWeight:500 }}>{row.type}</span>
                        <span style={{ color:'#4B5563', fontSize:'.63rem' }} className="mono">{row.loc}</span>
                        <span style={{ color:row.sc, fontSize:'.63rem' }} className="mono">{row.sev}</span>
                        <span style={{
                          display:'inline-block', padding:'2px 9px', borderRadius:100,
                          fontSize:'.6rem', color:row.stc, background:row.stbg, width:'fit-content',
                        }} className="mono">{row.stat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            CTA
        ════════════════════════════════════════════════════════════════ */}
        <div className="divider" />
        <section
          ref={ctaRef}
          style={{ padding:'112px 24px 128px', textAlign:'center', position:'relative', overflow:'hidden' }}
        >
          <div className="blob" style={{ width:800, height:400, background:'rgba(59,130,246,.11)', top:'50%', left:'50%', transform:'translate(-50%,-50%)' }} />
          <div className={`reveal ${ctaVis ? 'on' : ''}`} style={{ position:'relative', zIndex:1 }}>
            <div className="badge" style={{ margin:'0 auto 24px' }}>Get Started Today</div>
            <h2 style={{
              fontSize:'clamp(2rem,4.5vw,3.4rem)', fontWeight:900,
              letterSpacing:'-.035em', marginBottom:18, lineHeight:1.1,
            }}>
              Ready to take control<br />of your security?
            </h2>
            <p style={{ color:'#6B7280', fontSize:'1.1rem', lineHeight:1.8, maxWidth:460, margin:'0 auto 44px' }}>
              Join security teams using AI-powered monitoring to prevent incidents before they escalate — and keep every piece of evidence airtight.
            </p>
            <div className="cta-btns" style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap' }}>
              <Link to="/dashboard" className="btn-p" style={{ padding:'16px 48px', fontSize:'1.05rem' }}>
                Go to Dashboard →
              </Link>
              <Link to="/incidents" className="btn-s" style={{ padding:'16px 48px', fontSize:'1.05rem' }}>
                Browse Incidents
              </Link>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}

export default HomePage;
