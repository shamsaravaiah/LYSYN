"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type Sections = {
  patient_profile: string;
  complaints: string;
  observations: string;
  actions: string;
  risks: string;
  follow_up: string;
};

type SummaryResponse = {
  summary: string;
  sections: Sections;
};

type Patient = {
  id: string;
  name: string;
  visitType: string;
  room?: string;
};

const dummyPatients: Patient[] = [
  { id: "1", name: "John Doe", visitType: "hemmöte", room: "Rum 101" },
  { id: "2", name: "Anna Andersson", visitType: "rutinkontroll", room: "Rum 205" },
  { id: "3", name: "Erik Johansson", visitType: "akutbesök", room: "Rum 312" },
  { id: "4", name: "Maria Larsson", visitType: "hemmöte", room: "Rum 108" },
  { id: "5", name: "Lars Svensson", visitType: "uppföljning", room: "Rum 401" },
  { id: "6", name: "Ingrid Nilsson", visitType: "rutinkontroll", room: "Rum 203" },
];

export default function Home() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarising, setIsSummarising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<Patient>(dummyPatients[0]);

  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationIdRef = useRef<number | null>(null);

  // Draw waveform while recording - Improved version with frequency bars
  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use frequency data for better visualization
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);

      // Clear canvas with gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#f0fdf4");
      gradient.addColorStop(1, "#ffffff");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      const centerY = canvas.height / 2;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

        // Create gradient for each bar
        const barGradient = ctx.createLinearGradient(x, centerY - barHeight, x, centerY + barHeight);
        barGradient.addColorStop(0, "#22c55e");
        barGradient.addColorStop(0.5, "#16a34a");
        barGradient.addColorStop(1, "#15803d");

        ctx.fillStyle = barGradient;
        
        // Draw symmetric bars (top and bottom)
        const roundedBarWidth = Math.max(2, barWidth - 1);
        ctx.fillRect(x, centerY - barHeight, roundedBarWidth, barHeight);
        ctx.fillRect(x, centerY, roundedBarWidth, barHeight);

        x += barWidth + 1;
      }

      // Add center line for reference
      ctx.strokeStyle = "rgba(22, 163, 74, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(canvas.width, centerY);
      ctx.stroke();

      animationIdRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const startWaveform = (stream: MediaStream) => {
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; // Changed from 2048 for better bar visualization
    analyser.smoothingTimeConstant = 0.8; // Smooth animation
    source.connect(analyser);

    audioContextRef.current = audioCtx;
    analyserRef.current = analyser;

    drawWaveform();
  };

  const stopWaveform = () => {
    if (animationIdRef.current !== null) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      setTranscript("");
      setSummary(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        stopWaveform();

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        sendAudioToTranscribe(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      startWaveform(stream);
    } catch (e) {
      console.error(e);
      setError("Kunde inte starta mikrofonen. Kontrollera behörigheter.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const sendAudioToTranscribe = async (blob: Blob) => {
    try {
      setIsTranscribing(true);
      setError(null);

      const formData = new FormData();
      formData.append("audio", blob, "visit.webm");

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Kunde inte transkribera.");
      }

      setTranscript(json.transcript || "");
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Kunde inte transkribera.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const summarise = async () => {
    if (!transcript) return;
    try {
      setIsSummarising(true);
      setError(null);
      setSummary(null);

      const res = await fetch("/api/summarise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Kunde inte skapa sammanfattning.");
      }

      setSummary(json);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Kunde inte skapa sammanfattning.");
    } finally {
      setIsSummarising(false);
    }
  };

  // Make canvas responsive
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth - 40;
      canvas.height = 120;
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Welcome Page
  if (showWelcome) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#ffffff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "32px",
          }}
        >
          <Image
            src="/ChatGPT Image Nov 25, 2025, 05_00_46 PM (1).png"
            alt="LiSYN Logo"
            width={300}
            height={300}
            style={{
              maxWidth: "100%",
              height: "auto",
            }}
          />
          <button
            onClick={() => setShowWelcome(false)}
            style={{
              padding: "14px 32px",
              borderRadius: "12px",
              border: "none",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: 600,
              backgroundColor: "#16a34a",
              color: "#ffffff",
              transition: "all 0.2s",
              boxShadow: "0 4px 12px rgba(22, 163, 74, 0.3)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(22, 163, 74, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(22, 163, 74, 0.3)";
            }}
          >
            Testa det
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "#f8fafc",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarOpen ? "280px" : "80px",
          backgroundColor: "#ffffff",
          borderRight: "1px solid #e2e8f0",
          transition: "width 0.3s ease",
          display: "flex",
          flexDirection: "column",
          boxShadow: "2px 0 8px rgba(0,0,0,0.04)",
        }}
      >
        {/* Sidebar Header */}
        <div
          style={{
            padding: "20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: sidebarOpen ? "space-between" : "center",
            minHeight: "80px",
          }}
        >
          {sidebarOpen && (
            <div>
              <Image
                src="/ChatGPT Image Nov 25, 2025, 05_00_46 PM (1).png"
                alt="LiSYN"
                width={120}
                height={40}
                style={{
                  maxWidth: "100%",
                  height: "auto",
                  marginBottom: "4px",
                }}
              />
              <p
                style={{
                  fontSize: "12px",
                  color: "#64748b",
                  margin: "4px 0 0 0",
                }}
              >
                lyssna och sammanfatt med AI
              </p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748b",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              {sidebarOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M3 12h18M3 6h18M3 18h18" />
              )}
            </svg>
          </button>
        </div>

        {/* Patient List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px",
          }}
        >
          {sidebarOpen ? (
            <div>
              <h3
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  margin: "0 0 12px 12px",
                }}
              >
                Patienter
              </h3>
              {dummyPatients.map((patient) => (
                <div
                  key={patient.id}
                  onClick={() => setSelectedPatient(patient)}
                  style={{
                    padding: "12px 16px",
                    marginBottom: "4px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    backgroundColor:
                      selectedPatient.id === patient.id
                        ? "#f0fdf4"
                        : "transparent",
                    border:
                      selectedPatient.id === patient.id
                        ? "1px solid #86efac"
                        : "1px solid transparent",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedPatient.id !== patient.id) {
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedPatient.id !== patient.id) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: selectedPatient.id === patient.id ? "#16a34a" : "#1e293b",
                      fontSize: "14px",
                      marginBottom: "4px",
                    }}
                  >
                    {patient.name}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                    }}
                  >
                    {patient.visitType}
                  </div>
                  {patient.room && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#94a3b8",
                        marginTop: "2px",
                      }}
                    >
                      {patient.room}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", paddingTop: "20px" }}>
              {dummyPatients.slice(0, 6).map((patient) => (
                <div
                  key={patient.id}
                  onClick={() => setSelectedPatient(patient)}
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    backgroundColor:
                      selectedPatient.id === patient.id
                        ? "#16a34a"
                        : "#f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: selectedPatient.id === patient.id ? "#ffffff" : "#64748b",
                    fontWeight: 600,
                    fontSize: "16px",
                    transition: "all 0.2s",
                  }}
                  title={patient.name}
                >
                  {patient.name.charAt(0)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div
          style={{
            padding: "16px",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              backgroundColor: "#f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
              cursor: "pointer",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Top Header */}
        <header
          style={{
            backgroundColor: "#ffffff",
            borderBottom: "1px solid #e2e8f0",
            padding: "20px 32px",
            minHeight: "80px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "22px",
                fontWeight: 600,
                color: "#1e293b",
                margin: 0,
              }}
            >
              {selectedPatient.name}
            </h2>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginTop: "4px",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  color: "#64748b",
                  fontWeight: 500,
                }}
              >
                {selectedPatient.visitType}
              </span>
              {selectedPatient.room && (
                <>
                  <span style={{ color: "#cbd5e1" }}>•</span>
                  <span
                    style={{
                      fontSize: "14px",
                      color: "#64748b",
                    }}
                  >
                    {selectedPatient.room}
                  </span>
                </>
              )}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <Image
              src="/ChatGPT Image Nov 25, 2025, 05_00_46 PM (1).png"
              alt="LiSYN"
              width={100}
              height={33}
              style={{
                maxWidth: "100%",
                height: "auto",
              }}
            />
            <div
              style={{
                padding: "8px 16px",
                backgroundColor: "#f0fdf4",
                borderRadius: "8px",
                fontSize: "13px",
                color: "#16a34a",
                fontWeight: 500,
              }}
            >
              Aktiv session
            </div>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div
            style={{
              margin: "16px 32px",
              padding: "14px 16px",
              borderRadius: "10px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            {error}
          </div>
        )}

        {/* Main Content Area */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: "24px",
            padding: "24px 32px",
            overflow: "hidden",
          }}
        >
          {/* Left: Transcript Panel */}
          <section
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "#1e293b",
                  margin: 0,
                }}
              >
                Transkription
              </h3>
              {isTranscribing && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    color: "#64748b",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: "#16a34a",
                      animation: "pulse 2s infinite",
                    }}
                  />
                  Bearbetar...
                </div>
              )}
            </div>
            <div
              style={{
                flex: 1,
                overflow: "auto",
                background: "#f8fafc",
                borderRadius: "12px",
                padding: "20px",
                border: "1px solid #e2e8f0",
                minHeight: "400px",
              }}
            >
              {!transcript && !isTranscribing && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "#94a3b8",
                    textAlign: "center",
                  }}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    style={{ marginBottom: "12px", opacity: 0.5 }}
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="18" x2="12.01" y2="18"></line>
                  </svg>
                  <p style={{ margin: 0, fontSize: "14px" }}>
                    Transkriptionen visas här när inspelningen är klar
                  </p>
                </div>
              )}
              {transcript && (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: "14px",
                    lineHeight: 1.7,
                    color: "#1e293b",
                    margin: 0,
                    fontFamily: "inherit",
                  }}
                >
                  {transcript}
                </pre>
              )}
            </div>
          </section>

          {/* Right: Recording Controls */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            {/* Recording Card */}
            <section
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "32px",
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing || isSummarising}
                style={{
                  width: "120px",
                  height: "120px",
                  borderRadius: "50%",
                  border: "none",
                  cursor: isTranscribing || isSummarising ? "not-allowed" : "pointer",
                  fontSize: "16px",
                  fontWeight: 600,
                  backgroundColor: isRecording ? "#dc2626" : "#16a34a",
                  color: "#ffffff",
                  transition: "all 0.3s",
                  boxShadow: isRecording
                    ? "0 0 0 0 rgba(220, 38, 38, 0.7), 0 0 0 0 rgba(220, 38, 38, 0.7)"
                    : "0 4px 12px rgba(22, 163, 74, 0.3)",
                  transform: isRecording ? "scale(1.05)" : "scale(1)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  marginBottom: "24px",
                }}
                onMouseEnter={(e) => {
                  if (!isTranscribing && !isSummarising) {
                    e.currentTarget.style.transform = "scale(1.08)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = isRecording ? "scale(1.05)" : "scale(1)";
                }}
              >
                {isRecording ? (
                  <>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    <span>Stoppa</span>
                  </>
                ) : (
                  <>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>Starta</span>
                  </>
                )}
              </button>

              {/* Waveform */}
              <div
                style={{
                  width: "100%",
                  maxWidth: "600px",
                  padding: "20px",
                  borderRadius: "12px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  marginBottom: "16px",
                }}
              >
                <canvas
                  ref={canvasRef}
                  style={{
                    width: "100%",
                    height: 120,
                    display: "block",
                    borderRadius: "8px",
                  }}
                />
              </div>

              {isRecording && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "14px",
                    color: "#dc2626",
                    fontWeight: 500,
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: "#dc2626",
                      animation: "pulse 1.5s infinite",
                    }}
                  />
                  Inspelning pågår...
                </div>
              )}
            </section>

            {/* Action Buttons */}
            <div
              style={{
                display: "flex",
                gap: "12px",
              }}
            >
              <button
                onClick={summarise}
                disabled={!transcript || isSummarising}
                style={{
                  flex: 1,
                  padding: "16px 24px",
                  borderRadius: "12px",
                  border: "none",
                  cursor: transcript && !isSummarising ? "pointer" : "not-allowed",
                  fontSize: "15px",
                  fontWeight: 600,
                  backgroundColor: transcript && !isSummarising ? "#16a34a" : "#e2e8f0",
                  color: transcript && !isSummarising ? "#ffffff" : "#94a3b8",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                {isSummarising ? (
                  <>
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        border: "2px solid currentColor",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    Bearbetar...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    Skapa sammanfattning
                  </>
                )}
              </button>

              {summary && (
                <button
                  onClick={() => setShowSummaryModal(true)}
                  style={{
                    padding: "16px 24px",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    cursor: "pointer",
                    fontSize: "15px",
                    fontWeight: 600,
                    backgroundColor: "#ffffff",
                    color: "#16a34a",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  Visa anteckning
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Modal */}
      {showSummaryModal && summary && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "24px",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setShowSummaryModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              padding: "32px",
              maxWidth: "800px",
              maxHeight: "85vh",
              overflow: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              width: "100%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
                paddingBottom: "20px",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#1e293b",
                    margin: 0,
                  }}
                >
                  Vårdanteckning
                </h2>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#64748b",
                    margin: "4px 0 0 0",
                  }}
                >
                  {selectedPatient.name} • {new Date().toLocaleDateString("sv-SE")}
                </p>
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  color: "#64748b",
                  cursor: "pointer",
                  fontSize: "24px",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "10px",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#e2e8f0";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#f1f5f9";
                }}
              >
                ×
              </button>
            </div>

            <div style={{ fontSize: "15px", lineHeight: 1.8, color: "#1e293b" }}>
              <div style={{ marginBottom: "24px" }}>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    marginBottom: "12px",
                    color: "#16a34a",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "4px",
                      height: "20px",
                      backgroundColor: "#16a34a",
                      borderRadius: "2px",
                    }}
                  />
                  Sammanfattning
                </h3>
                <p style={{ margin: 0, paddingLeft: "12px" }}>{summary.summary}</p>
              </div>

              {Object.entries(summary.sections).map(([key, value]) => {
                const labels: Record<string, string> = {
                  patient_profile: "Patientprofil",
                  complaints: "Besvär",
                  observations: "Observationer",
                  actions: "Åtgärder",
                  risks: "Risker",
                  follow_up: "Uppföljning",
                };

                return (
                  <div key={key} style={{ marginBottom: "24px" }}>
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: 600,
                        marginBottom: "12px",
                        color: "#16a34a",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          width: "4px",
                          height: "20px",
                          backgroundColor: "#16a34a",
                          borderRadius: "2px",
                        }}
                      />
                      {labels[key]}
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: "24px" }}>
                      <li style={{ paddingLeft: "12px" }}>{value}</li>
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
