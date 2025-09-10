// sockets/voice.js  — FULL REPLACEMENT

const OpenAI = require("openai");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const Test = require("../models/Test");
const TestMaster = require("../models/TestMaster");
const Question = require("../models/Question");
const Answer = require("../models/Answer");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const WebSocket = require("ws");
const fs = require("fs");
const uploadToFTP = require("../utils/ftpUploader");

// Verify Deepgram API key is set
if (!process.env.DEEPGRAM_API_KEY) {
  console.error("❌ DEEPGRAM_API_KEY environment variable not set");
  process.exit(1);
}

/**
 * Per-socket voice session state (functional, no classes)
 */
function createSession(socket, { testId, userId, openai, deepgram }) {
  const session = {
    _dgConn: null,
    socket,
    testId,
    userId,
    deepgram,
    isActive: true,
  };

  const state = {
    socket,
    testId,
    userId,
    questions: [],
    currentQuestionIndex: 0,
    currentTranscript: "",
    isListening: false,
    dgConn: null,
    recordedChunks: [], // ✅ initialize here
  };

  // 🔑 expose state so audio-data handler can access it
  session.state = state;

  async function initializeTest() {
    try {
      const test = await Test.findByPk(state.testId);
      if (!test) throw new Error("Test not found");

      const testMaster = await TestMaster.findByPk(test.master_test_id);
      if (!testMaster) throw new Error("Test master not found");

      // Save master test id on session state so saves use the correct FK
      state.testMasterId = testMaster.test_id;

      state.questions = await Question.findAll({
        where: { test_id: testMaster.test_id },
        order: [["order_no", "ASC"]],
        raw: true,
      });

      await loadQuestion(0);
      return true;
    } catch (err) {
      console.error("❌ Test initialization failed:", err);
      safeEmit("error", { message: err.message || "Initialization failed" });
      return false;
    }
  }
 
 async function loadQuestion(index) {
    if (!state.questions || index >= state.questions.length) {
      safeEmit("test-completed", { answers: true });
      cleanup();
      return;
    }

    // Clear all transcript states for new question - ensure complete reset
    state.currentQuestionIndex = index;
    state.currentTranscript = "";
    state.partialAnswer = "";
    state.awaitingConfirmation = null;
    state.awaitingReanswerChoice = false;
    state.recordedChunks = [];
    state.handlingSubmit = false;
    
    // Clear any pending AI debounce timers
    if (state.socket._aiDebounce) {
      clearTimeout(state.socket._aiDebounce);
      state.socket._aiDebounce = null;
    }

    const question = state.questions[index];

    const existingAnswer = await Answer.findOne({
      where: {
        test_id: state.testMasterId, // ✅ answers are saved under the master test id
        user_id: state.userId,
        question_id: question.question_id,
      },
      raw: true,
    });

    safeEmit("question-loaded", {
      questionIndex: index,
      question: question.text,
      totalQuestions: state.questions.length,
      existingAnswer: existingAnswer
        ? {
            transcript: existingAnswer.final_transcript,
            submitted_at: existingAnswer.submitted_at,
          }
        : null,
      autoPlayTTS: true,
      autoStartSTT: !existingAnswer,
      aiMode: true,
    });

    // If already answered, ask user if they want to reanswer or move on
    if (existingAnswer) {
      // Speak only the reanswer-or-next prompt
      await speakText(
        "You already answered this question. Do you want to reanswer or move to the next question?"
      );
      state.awaitingReanswerChoice = true;
      // 🚫 Do not start STT here — wait for frontend signal after TTS finishes
    } else {
      // Speak the question itself
      await speakText(question.text);
      // Then trigger STT after TTS is done (frontend will get 'tts' audio and play it)
      setTimeout(() => {
        safeEmit("stt-ready", { autoStart: true });
      }, 400);
    }
  }

async function analyzeUserSpeech(transcript) {
    try {
      // Note: Immediate keyword detection is now handled in handleDeepgramMessage
      // before this function is called, so we only get here for non-keyword cases

      // Additional filtering to prevent unnecessary AI calls
      // Skip AI analysis for very short or incomplete phrases
      const words = transcript.split(/\s+/);
      if (words.length <= 3 &&
          !/[.!?]$/.test(transcript) && // Not a complete sentence
          !/\b(complete|done|submit|finished|that's|this is)\b/i.test(transcript)) {
        console.log(`⏭️ [AI] Skipping analysis for short/incomplete phrase: "${transcript}"`);
        return;
      }

      // Only call OpenAI for AI analysis (this runs in background)
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an AI exam proctor.
The student is answering verbally.
Your job: decide if they are still thinking, mid-answer, or done.

Rules:
- If the answer looks incomplete or mid-sentence → CONTINUE
- If the answer looks like a full thought → COMPLETE
- Do not decide SUBMIT directly. Only return COMPLETE if done.
- Consider sentence structure, completeness, and natural pauses
Reply with exactly one word: CONTINUE or COMPLETE.`,
          },
          {
            role: "user",
            content: `Question: "${
              state.questions[state.currentQuestionIndex]?.text || ""
            }"\nUser's answer so far: "${transcript}"`,
          },
        ],
        temperature: 0,
        max_tokens: 5,
      });

      const raw = response.choices?.[0]?.message?.content || "";
      let intent = "CONTINUE";
      
      const match = raw.toUpperCase().match(/(COMPLETE|CONTINUE)/);
      intent = match ? match[1] : "CONTINUE";

      console.log(`🧠 [AI] intent parsed: ${intent} for: "${transcript.substring(0, 50)}${transcript.length > 50 ? '...' : ''}"`);

      // Handle confirmation states (moved from keyword detection to here)
      if (
        (state.awaitingConfirmation || state.awaitingReanswerChoice) &&
        transcript &&
        transcript.trim()
      ) {
        const l = transcript.toLowerCase();

        // 1) Re-answer path
        if (
          /\b(re[- ]?answer|retry|try again|re[- ]?record|start over|again)\b/.test(
            l
          )
        ) {
          state.awaitingConfirmation = null;
          state.awaitingReanswerChoice = false;
          state.partialAnswer = "";
          await handleUserIntent("RETRY");
          return;
        }

        // 2) If we were in "already answered" prompt, allow "next"/"move on"/"continue"
        if (
          state.awaitingReanswerChoice &&
          /\b(next|move on|continue)\b/.test(l)
        ) {
          state.awaitingReanswerChoice = false;
          await handleUserIntent("NEXT");
          return;
        }

        // 3) Normal submit confirmation
        if (
          !state.awaitingReanswerChoice &&
          /\b(submit|save|final|done|yes)\b/.test(l)
        ) {
          const finalForSubmit =
            state.partialAnswer && state.partialAnswer.trim()
              ? state.partialAnswer
              : state.awaitingConfirmation || transcript;
          await handleUserIntent("SUBMIT", finalForSubmit);
          state.awaitingConfirmation = null;
          return;
        }
      }

      // Prepare message & (if COMPLETE) generate TTS and include audio in payload
      const message =
        intent === "COMPLETE"
          ? "I heard your answer. Do you want to submit it or reanswer?"
          : null;

      let audioBase64 = null;
      if (message) {
        try {
          // generate TTS via Deepgram and collect base64
          const resp = await deepgram.speak.request(
            { text: message },
            { model: "aura-2-saturn-en", encoding: "linear16", container: "wav" }
          );
          const stream = await resp.getStream();
          const reader = stream.getReader();
          const chunks = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const dataArray = chunks.reduce(
            (acc, chunk) => Uint8Array.from([...acc, ...chunk]),
            new Uint8Array(0)
          );
          const buffer = Buffer.from(dataArray.buffer);
          audioBase64 = buffer.toString("base64");
        } catch (e) {
          console.error("❌ TTS generation failed:", e);
        }
      }

      // Emit ai-conversation with optional audio
      state.socket.emit("ai-conversation", {
        message,
        intent,
        audio: audioBase64, // frontend will play this if present
      });

      // When marking "awaiting confirmation" prefer the combined partial answer
      if (intent === "COMPLETE") {
        state.awaitingConfirmation = state.partialAnswer || transcript;
        console.log(
          "🔍 [BACKEND] Storing for confirmation:",
          (state.awaitingConfirmation || "").substring(0, 50) + "..."
        );
      }
    } catch (err) {
      console.error("❌ Speech analysis failed:", err);
    }
  }

  async function handleUserIntent(intent, transcript) {
    switch (intent) {
      case "SUBMIT":
        if (state.handlingSubmit) {
          console.log("🔁 [SUBMIT] Duplicate submit ignored");
          return;
        }
        state.handlingSubmit = true;
        try {
          const finalTranscript =
            (transcript && transcript.trim()) ||
            state.awaitingConfirmation ||
            state.currentTranscript ||
            state.partialAnswer ||
            "";
          if (!finalTranscript) {
            console.log("⚠️ [SUBMIT] No transcript available, skipping save");
          } else {
            await saveAnswer(finalTranscript);
          }
          await speakText("Answer saved. Moving to the next question.");
          await loadQuestion(state.currentQuestionIndex + 1);
          state.awaitingConfirmation = null;
        } catch (err) {
          console.error("❌ [SUBMIT] Error during submit:", err);
        } finally {
          state.handlingSubmit = false;
        }
        break;
     case "RETRY":
        state.currentTranscript = "";
        state.partialAnswer = "";
        state.awaitingConfirmation = null;
        state.awaitingReanswerChoice = false;
        state.recordedChunks = [];
        await reanswerNow();
        break;

      case "CONTINUE":
        await speakText("Go ahead, continue your answer.");
        break;
      case "NEXT":
        if (state.socket._dgWS?.readyState === WebSocket.OPEN) {
          try {
            state.socket._dgWS.send(JSON.stringify({ type: "Flush" }));
          } catch {}
        }
        await loadQuestion(state.currentQuestionIndex + 1);
        break;
      case "REPEAT":
        await speakText(state.questions[state.currentQuestionIndex].text);
        break;
      case "SKIP":
        await Answer.create({
          test_id: state.testMasterId,
          user_id: state.userId,
          question_id: state.questions[state.currentQuestionIndex].question_id,
          final_transcript: "",
          status: "skipped",
          attempt_number: 1,
          submitted_at: new Date(),
        });
        await speakText("Okay, skipping this question.");
        await loadQuestion(state.currentQuestionIndex + 1);
        break;

      default:
        console.warn("🧠 [AI] Unknown intent, defaulting to CONTINUE");
        await speakText("Please continue your answer.");
        break;
    }
  }

  async function saveAnswer(transcript) {
    try {
      // ✅ Use the correct state reference for partialAnswer
      const toSave =
        (state.partialAnswer && state.partialAnswer.trim()) ||
        (transcript && transcript.trim()) ||
        (state.awaitingConfirmation && state.awaitingConfirmation.trim()) ||
        "";

      console.log("📝 [SAVE DEBUG]", {
        partialAnswer: state.partialAnswer,
        awaitingConfirmation: state.awaitingConfirmation,
        currentTranscript: state.currentTranscript,
        toSave,
      });

      if (!toSave) {
        console.warn("⚠️ [BACKEND] saveAnswer called but no transcript");
        return null;
      }

      // ✅ Ensure we have master test id
      const masterTestId = state.testMasterId;
      if (!masterTestId) {
        console.error("❌ No master test id found");
        return null;
      }

      // ✅ Get attempt number (increment if reanswer)
      // ✅ Check if an Answer already exists for this user+question
      const existing = await Answer.findOne({
        where: {
          test_id: masterTestId,
          user_id: state.userId,
          question_id: state.questions[state.currentQuestionIndex].question_id,
        },
      });

      // ✅ Collect audio now (so we can upload in background)
      let audioUrl = existing?.audio_url || null;
      let durationSeconds = existing?.duration_seconds || null;
      let audioBuffer = null;

      if (state.recordedChunks?.length) {
        audioBuffer = Buffer.concat(state.recordedChunks);
        state.recordedChunks = []; // clear buffer
        durationSeconds = Math.round(audioBuffer.length / 32000);
      }

      // ✅ If no row → create, else update
      let answer;
      if (!existing) {
        answer = await Answer.create({
          test_id: masterTestId,
          user_id: state.userId,
          question_id: state.questions[state.currentQuestionIndex].question_id,
          final_transcript: toSave,
          audio_url: audioUrl,
          duration_seconds: durationSeconds,
          status: "answered",
          attempt_number: 1,
          submitted_at: new Date(),
        });
      } else {
        const newAttempt = (existing.attempt_number || 1) + 1;
        await existing.update({
          final_transcript: toSave,
          submitted_at: new Date(),
          status: "rerecorded",
          attempt_number: newAttempt,
        });
        answer = existing;
      }

      console.log(
        "✅ [BACKEND] Answer saved (initial):",
        answer.toJSON?.() || answer
      );

      // ✅ Background: upload audio & send to Deepgram for full transcript
      // ✅ Background: pick a URL (client URL wins), else upload our buffer, then transcribe via Deepgram URL
      {
        (async () => {
          try {
            // 1) Prefer a client-provided URL
            let uploadedUrl = state.externalAudioUrl || null;

            // 2) Else upload our recorded buffer
            if (!uploadedUrl && audioBuffer) {
              uploadedUrl = await uploadToFTP(
                audioBuffer,
                `answer-${state.userId}-${
                  state.questions[state.currentQuestionIndex].question_id
                }-${Date.now()}.wav`,
                "test_answers"
              );
              console.log("✅ [FTP] Uploaded to:", uploadedUrl);
            }

            // Clear the external URL after use
            state.externalAudioUrl = null;

            if (uploadedUrl) {
              // 3) Transcribe the URL with Deepgram prerecorded
              const resp = await deepgram.listen.prerecorded.transcribeUrl(
                { url: uploadedUrl },
                { model: "nova-3", language: "en-US", punctuate: true }
              );

              const dgTranscript =
                resp.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
                null;

              if (dgTranscript) {
                await answer.update({
                  audio_url: uploadedUrl,
                  duration_seconds: durationSeconds,
                  final_transcript: dgTranscript,
                });
                console.log("✅ [Deepgram] Transcript updated for answer:", {
                  answerId: answer.answer_id,
                  url: uploadedUrl,
                });
              } else {
                await answer.update({
                  audio_url: uploadedUrl,
                  duration_seconds: durationSeconds,
                });
              }
            } else {
              console.log("ℹ️ No audio URL or buffer to upload/transcribe.");
            }
          } catch (err) {
            console.error("❌ Background upload/transcribe failed:", err);
          }
        })();
      }

      // Reset transcripts for next question
      state.partialAnswer = "";
      state.currentTranscript = "";
      state.awaitingConfirmation = null;

      return answer;
    } catch (err) {
      console.error("❌ Failed to save answer:", err);
      return null;
    }
  }

  async function speakText(text) {
    try {
      const resp = await deepgram.speak.request(
        { text },
        { model: "aura-2-saturn-en", encoding: "linear16", container: "wav" }
      );
      const stream = await resp.getStream();
      const reader = stream.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const dataArray = chunks.reduce(
        (acc, chunk) => Uint8Array.from([...acc, ...chunk]),
        new Uint8Array(0)
      );
      const buffer = Buffer.from(dataArray.buffer);
      socket.emit("tts", { audio: buffer.toString("base64") });
    } catch (err) {
      console.error("❌ TTS failed:", err);
    }
  }

  async function reanswerNow() {
    // Clear all transcript states completely - ensure deep clean
    state.currentTranscript = "";
    state.partialAnswer = "";
    state.awaitingConfirmation = null;
    state.awaitingReanswerChoice = false;
    state.recordedChunks = [];
    state.handlingSubmit = false;
    
    // Clear any pending AI analysis
    if (state.socket._aiDebounce) {
      clearTimeout(state.socket._aiDebounce);
      state.socket._aiDebounce = null;
    }
    
    console.log("🔁 [BACKEND] REANSWER requested — restarting recording");
    await speakText("Okay, please answer again.");
    
    // Flush Deepgram to start fresh and clear its buffer
    if (state.socket._dgWS?.readyState === WebSocket.OPEN) {
      try {
        state.socket._dgWS.send(JSON.stringify({ type: "Flush" }));
        // Send a second flush after a small delay to ensure complete reset
        setTimeout(() => {
          if (state.socket._dgWS?.readyState === WebSocket.OPEN) {
            state.socket._dgWS.send(JSON.stringify({ type: "Flush" }));
          }
        }, 100);
      } catch {}
    }
    
    // Clear the frontend transcript by emitting empty transcript
    state.socket.emit("live-transcription", {
      text: "",
      isFinal: true,
      confidence: 0,
    });
    
    // Give a small delay before starting recording again
    setTimeout(() => {
      state.socket.emit("stt-ready", { autoStart: true }); // client will emit start-recording
    }, 300);
  }

  function cleanup() {
    try {
      session.isActive = false;
      
      // Clear all pending timers
      if (state.socket._aiDebounce) {
        clearTimeout(state.socket._aiDebounce);
        state.socket._aiDebounce = null;
      }
      
      // Close Deepgram connection if open
      if (state.socket._dgWS?.readyState === WebSocket.OPEN) {
        try {
          state.socket._dgWS.send(JSON.stringify({ type: "Flush" }));
          state.socket._dgWS.close();
        } catch {}
      }
      
      // Clear all state variables
      state.currentTranscript = "";
      state.partialAnswer = "";
      state.awaitingConfirmation = null;
      state.awaitingReanswerChoice = false;
      state.recordedChunks = [];
      state.handlingSubmit = false;
      
    } catch (e) {
      console.error("❌ Cleanup error:", e);
    }
  }

  function safeEmit(event, payload = {}) {
    try {
      if (session.isActive) {
        state.socket.emit(event, payload);
      }
    } catch (e) {
      console.error(`❌ socket emit failed (${event})`, e);
    }
  }

  // Silence detection helper
  // Silence detection: forward pause to AI instead of fixed 3s cutoff
  socket.on("user-silence", () => {
    console.log(
      "⏸️ [AI] User pause detected, asking AI if they are still thinking or done..."
    );
    // Run immediately on explicit silence event
    clearTimeout(socket._aiDebounce);
    session
      .analyzeUserSpeech(session.state.partialAnswer || "")
      .catch(console.error);
  });

  return {
    state, // 🔑 expose state
    saveAnswer, // 🔑 expose saveAnswer
    initializeTest,
    loadQuestion,
    handleUserIntent, // 🔑 expose handleUserIntent for keyword detection
    speakText,
    cleanup,
    analyzeUserSpeech, // expose for use outside
    reanswerNow,
  };
}

// function startDeepgramStream(socket) {
//   const deepgramSocket = new WebSocket(
//     "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&punctuate=true&smart_format=true&vad_events=true&interim_results=true&encoding=linear16&sample_rate=16000",
//     { headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` } }
//   );

//   deepgramSocket.on("open", () => {
//     console.log("✅ [STT] Deepgram live stream opened");
//     // heartbeat ping to keep alive
//     setInterval(() => {
//       if (deepgramSocket.readyState === WebSocket.OPEN) {
//         deepgramSocket.send(JSON.stringify({ type: "KeepAlive" }));
//       }
//     }, 5000);
//   });

//   deepgramSocket.on("message", (msg) => {
//     try {
//       const data = JSON.parse(msg.toString());
//       const transcript = data.channel?.alternatives?.[0]?.transcript || "";
//       const isFinal = !!data.is_final || !!data.speech_final;

//       if (transcript && transcript.trim() !== "") {
//         if (isFinal) {
//           const classifySentence = (t) => {
//             if (
//               /[?]$/.test(t) ||
//               /\b(who|what|when|where|why|how|is|are|do|does|did|can|could|would|should)\b/i.test(
//                 t
//               )
//             )
//               return "question";
//             if (/[!]$/.test(t)) return "exclamation";
//             return "statement";
//           };
//           const sentenceType = classifySentence(transcript.trim());
//           console.log(
//             `📝 [STT][final] ${
//               socket.id
//             }: "${transcript.trim()}" (${sentenceType})`
//           );

//           socket.emit("live-transcription", {
//             text: transcript.trim(),
//             isFinal: true,
//             confidence: data.channel?.alternatives?.[0]?.confidence || 0,
//             sentenceType,
//           });

//           // Use the per-socket session (defined above in io.on("connection"))
//           // Use the per-socket session safely
//           // SAFELY use per-socket session (no state reference here)
//           const activeSession = socket._session;
//           if (activeSession && transcript && transcript.trim()) {
//             const userAnswer = transcript.trim();

//             // Incrementally build transcript like a natural sentence
//             if (!activeSession.partialAnswer) activeSession.partialAnswer = "";
//             activeSession.partialAnswer +=
//               (activeSession.partialAnswer ? " " : "") + userAnswer;

//             console.log(
//               `📝 [STT][built] ${socket.id}: "${activeSession.partialAnswer}"`
//             );

//             // Always send to AI — let AI decide if it's pause/continue/submit
//             activeSession
//               .analyzeUserSpeech(activeSession.partialAnswer, {
//                 context:
//                   "Determine if the user is still thinking (pause), mid-answer, or has completed. If incomplete sentence, return CONTINUE. If it looks complete or conclusive, return SUBMIT or NEXT.",
//               })
//               .catch((err) =>
//                 console.error("❌ analyzeUserSpeech error:", err)
//               );
//           }
//         } else {
//           // interim – emit as non-final so frontend can show live text
//           socket.emit("live-transcription", {
//             text: transcript.trim(),
//             isFinal: false,
//           });
//         }
//       }
//     } catch (err) {
//       console.error("❌ [STT] Error parsing Deepgram:", err);
//     }
//   });

//   deepgramSocket.on("error", (err) => {
//     console.error("❌ [STT] Deepgram error:", err);
//   });

//   deepgramSocket.on("close", (code, reason) => {
//     console.log(`🔌 [STT] Deepgram closed. Code: ${code}, Reason: ${reason}`);
//     if (socket.connected) {
//       console.log("🔄 [STT] Restarting Deepgram stream...");
//       startDeepgramStream(socket);
//     }
//   });

//   socket.on("audio-data", (buffer) => {
//     if (deepgramSocket.readyState === WebSocket.OPEN) {
//       deepgramSocket.send(buffer);
//     }
//   });
// }

function handleDeepgramMessage(socket, msg) {
  try {
    const data = JSON.parse(msg.toString());
    const transcript = data.channel?.alternatives?.[0]?.transcript?.trim();
    const isFinal = !!data.is_final || !!data.speech_final;
    if (!transcript) return;

    // 🚀 IMMEDIATE forward - zero delay for live transcription
    socket.emit("live-transcription", {
      text: transcript,
      isFinal,
      confidence: data.channel?.alternatives?.[0]?.confidence || 0,
    });

    // Exit immediately for interim - no processing
    if (!isFinal) return;

    const activeSession = socket._session;
    if (!activeSession) return;
    
    // Build transcript incrementally
    if (!activeSession.state.partialAnswer) activeSession.state.partialAnswer = "";
    activeSession.state.partialAnswer +=
      (activeSession.state.partialAnswer ? " " : "") + transcript;

    console.log(`🔍 [STT][final] ${socket.id}: "${transcript}"`);

    // Check for immediate action keywords first (before AI)
    const lowerTranscript = transcript.toLowerCase();
    
    // Immediate keyword detection - handle these immediately without AI
    if (/\b(submit|save|done|yes|final)\b/.test(lowerTranscript) && activeSession.state.awaitingConfirmation) {
      console.log("🎯 [KEYWORD] Quick submit detected");
      activeSession.handleUserIntent("SUBMIT", activeSession.state.awaitingConfirmation).catch(console.error);
      return;
    }
    
    if (/\b(re[-\s]?answer|retry|again|re[-\s]?record|start over)\b/.test(lowerTranscript)) {
      console.log("🎯 [KEYWORD] Quick reanswer detected");
      activeSession.handleUserIntent("RETRY").catch(console.error);
      return;
    }
    
    if (/\b(next|skip|continue|move on)\b/.test(lowerTranscript) && activeSession.state.awaitingReanswerChoice) {
      console.log("🎯 [KEYWORD] Quick next detected");
      activeSession.handleUserIntent("NEXT").catch(console.error);
      return;
    }

    // Skip AI analysis for very short phrases (single words, connectors)
    // This prevents AI from analyzing every "and", "the", "to", etc.
    const words = transcript.split(/\s+/);
    if (words.length <= 2 &&
        !/\.$|!$|\?$/.test(transcript) && // Skip if not ending with punctuation
        !/\b(complete|done|submit|reanswer|retry|next)\b/i.test(transcript)) {
      console.log(`⏭️ [AI] Skipping analysis for short phrase: "${transcript}"`);
      return;
    }

    // Check if this looks like a complete sentence (ends with punctuation)
    const isCompleteSentence = /[.!?]$/.test(transcript);
    
    // Debounce AI analysis - shorter delay for complete sentences, longer for fragments
    const debounceDelay = isCompleteSentence ? 1000 : 2000;
    
    clearTimeout(socket._aiDebounce);
    socket._aiDebounce = setTimeout(() => {
      // Run AI completely async in background
      setImmediate(() => {
        if (activeSession?.analyzeUserSpeech) {
          // Clone the transcript to avoid race conditions
          const currentTranscript = activeSession.state.partialAnswer;
          activeSession.analyzeUserSpeech(currentTranscript).catch(console.error);
        }
      });
    }, debounceDelay);
  } catch (err) {
    console.error("❌ [STT] Error parsing Deepgram:", err);
  }
}

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("👤 Connected:", socket.id);
    /** @type {ReturnType<typeof createSession> | null} */
    socket._session = null;

    // Create per-socket session for AI intent + transcript handling

    socket.on("start-test", async ({ testId, userId }) => {
      try {
        socket._session?.cleanup();
        socket._session = createSession(socket, {
          testId,
          userId,
          openai,
          deepgram,
        });
        await socket._session.initializeTest();

        // 🔑 Open Deepgram WS immediately and keep alive
        const dgWS = new WebSocket(
          "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&punctuate=true&smart_format=true&vad_events=true&interim_results=true&encoding=linear16&sample_rate=16000",
          {
            headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
          }
        );

        socket._dgWS = dgWS;
        socket._dgReady = false;
        socket._audioQueue = [];

        dgWS.on("open", () => {
          console.log("✅ [STT] Deepgram connection opened at start-test");
          socket._dgReady = true;
          // flush queue if any
          while (socket._audioQueue.length > 0) {
            const chunk = socket._audioQueue.shift();
            dgWS.send(chunk);
          }
        });

        dgWS.on("message", (msg) => handleDeepgramMessage(socket, msg));

        dgWS.on("error", (err) => {
          console.error("❌ [STT] Deepgram error:", err);
        });

        dgWS.on("close", (code, reason) => {
          console.log(
            `🔌 [STT] Deepgram closed. Code: ${code}, Reason: ${reason}`
          );
        });
      } catch (e) {
        console.error("❌ start-test error:", e);
        socket.emit("error", { message: "Could not start test" });
      }
    });

    socket.on("navigate-to-question", async ({ questionIndex }) => {
      if (!socket._session) return;

      try {
        if (socket._dgWS?.readyState === WebSocket.OPEN) {
          try {
            socket._dgWS.send(JSON.stringify({ type: "Flush" }));
          } catch {}
        }

        await socket._session.loadQuestion(questionIndex);
      } catch (e) {
        console.error("❌ navigate-to-question error:", e);
        socket.emit("error", { message: "Navigation failed" });
      }
    });

    socket.on("reanswer", async () => {
      const session = socket._session;
      if (!session) return;
      await session.reanswerNow();
    });

    // 🔑 New event: start STT after frontend finishes playing TTS
    socket.on("start-stt", () => {
      console.log("🎤 [BACKEND] start-stt received from frontend");
      // Reuse the same flow as if the client pressed "start-recording"
      socket.emit("stt-ready", { autoStart: true });
      socket.emit("start-recording", { sampleRate: 16000 });
    });

    socket.on("user-intent", async ({ intent }) => {
      const session = socket._session;
      if (!session) return;

      try {
        if (intent === "submit") {
          // Use the per-session handler (idempotent) and prefer stored awaitingConfirmation
          if (session.state.handlingSubmit) {
            console.log("🔁 [SUBMIT] Duplicate submit ignored (user-intent)");
            return;
          }
          session.state.handlingSubmit = true;
          // Prefer partialAnswer (full sentence), then awaitingConfirmation, then currentTranscript
          // Always prefer the built partialAnswer, then fallback
          const transcriptToSave =
            (session.partialAnswer && session.partialAnswer.trim()) ||
            (session.state.awaitingConfirmation &&
              session.state.awaitingConfirmation.trim()) ||
            (session.state.currentTranscript &&
              session.state.currentTranscript.trim()) ||
            "";

          if (transcriptToSave) {
            await session.saveAnswer(transcriptToSave);
            session.partialAnswer = ""; // reset after successful save
          } else {
            console.log(
              "⚠️ [SUBMIT] No transcript available for user-intent submit"
            );
          }
          await session.speakText("Answer saved. Moving to the next question.");
          await session.loadQuestion(session.state.currentQuestionIndex + 1);
          session.state.awaitingConfirmation = null;
          session.state.handlingSubmit = false;
        } else if (intent === "reanswer") {
          session.state.currentTranscript = "";
          session.state.awaitingConfirmation = null;
          session.partialAnswer = "";
          await session.speakText("Okay, please answer again.");
          // Ask the client to start STT (client will emit 'start-recording')
          session.socket.emit("stt-ready", { autoStart: true });
        }
      } catch (err) {
        console.error("❌ user-intent handler error:", err);
        session.state.handlingSubmit = false;
      }
    });

    // Allow frontend to directly emit `submit-answer` with optional { transcript }
   socket.on("submit-answer", async (payload = {}) => {
      const session = socket._session;
      if (!session) return;

      if (session.state.handlingSubmit) {
        console.log(
          "🔍 [SUBMIT] Duplicate submit ignored (submit-answer event)"
        );
        return;
      }
      session.state.handlingSubmit = true;
      try {
        // Fix: Use state.partialAnswer correctly
        const transcript =
          (session.state.partialAnswer && session.state.partialAnswer.trim()) ||
          (payload && payload.transcript && payload.transcript.trim()) ||
          (session.state.awaitingConfirmation &&
            session.state.awaitingConfirmation.trim()) ||
          (session.state.currentTranscript &&
            session.state.currentTranscript.trim()) ||
          "";

        if (payload?.audioUrl) {
          session.state.externalAudioUrl = payload.audioUrl; // ✅ use client-provided URL
        }
        if (transcript) {
          await session.saveAnswer(transcript);
        } else {
          console.log(
            "⚠️ [SUBMIT] submit-answer received but no transcript available"
          );
        }

        await session.speakText("Answer saved. Moving to the next question.");
        await session.loadQuestion(session.state.currentQuestionIndex + 1);
        session.state.awaitingConfirmation = null;
        // clear saved partialAnswer so next question starts fresh
        session.partialAnswer = "";
      } catch (err) {
        console.error("❌ submit-answer handler error:", err);
      } finally {
        session.state.handlingSubmit = false;
      }
    });

    socket.on("start-recording", async () => {
      console.log(`🎤 [STT] Recording started for ${socket.id}`);
      if (socket._dgReady) {
        socket.emit("recording-started");
      } else {
        console.warn("⚠️ [STT] Deepgram not ready yet, will buffer audio");
      }
    });

    socket.on("stop-recording", () => {
      if (!socket._session) return;

      console.log("🛑 [STT] Stop recording requested – sending flush-final");

      // 🔑 Tell Deepgram WS to finalize immediately
      if (socket._dgWS && socket._dgWS.readyState === WebSocket.OPEN) {
        try {
          socket._dgWS.send(JSON.stringify({ type: "Flush" }));
        } catch (e) {
          console.error("⚠️ Failed to send flush-final:", e);
        }
      }

      if (socket._dgWS?.readyState === WebSocket.OPEN) {
        try {
          socket._dgWS.send(JSON.stringify({ type: "Flush" }));
        } catch {}
      }

      socket.isListening = false;
    });

    socket.on("audio-data", (payload) => {
      try {
        let buffer;
        if (payload instanceof ArrayBuffer) {
          buffer = Buffer.from(payload);
        } else if (ArrayBuffer.isView(payload)) {
          buffer = Buffer.from(
            payload.buffer,
            payload.byteOffset,
            payload.byteLength
          );
        } else if (Buffer.isBuffer(payload)) {
          buffer = payload;
        } else if (payload && payload.buffer instanceof ArrayBuffer) {
          buffer = Buffer.from(payload.buffer);
        } else {
          console.warn("⚠️ [STT] Unsupported audio-data type");
          return;
        }

        if (socket._dgReady && socket._dgWS?.readyState === WebSocket.OPEN) {
          socket._dgWS.send(buffer);
        } else {
          socket._audioQueue.push(buffer);
          // console.log(`📦 [STT] Queued audio chunk (${buffer.length} bytes)`);
        }
        // Collect audio per question so we can upload after submit
        if (socket._session) {
          const st = socket._session.state;
          if (!st.recordedChunks) st.recordedChunks = [];
          st.recordedChunks.push(buffer);
        }
      } catch (e) {
        console.error("❌ [STT] audio-data error:", e);
      }
    });

    socket.on("tts", async ({ text }, ack) => {
      try {
        if (text && socket._session?.isActive) {
          const resp = await deepgram.speak.request(
            { model: "aura-2-saturn-en" },
            { text }
          );
          const buffer = Buffer.from(await resp.arrayBuffer());
          socket.emit("tts", { audio: buffer.toString("base64") });
        }
      } catch (e) {
        console.error("❌ TTS (confirmation) error:", e);
      } finally {
        if (typeof ack === "function") ack();
      }
    });

 
// disconnect 
    socket.on("disconnect", () => {
      try {
        socket._session?.cleanup();
      } catch (_) {}
      socket._session = null;
      console.log("🔴 Disconnected:", socket.id);
    });
  });
};
