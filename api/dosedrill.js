
// This file runs on the server (Vercel), NOT in the user's browser.
// That's important: it's the only safe place to use your secret API key.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  const { mode, drug, age, weight, condition, category, difficulty, trapMode, studentAnswer, question } = req.body;

  // System prompt: this is the instruction set that shapes how the AI behaves.
  // mode "generate" -> AI creates a new practice question
  // mode "check"    -> AI grades the student's answer
  let systemPrompt = "";
  let userMessage = "";

  if (mode === "generate") {
    const difficultyInstructions = {
      Beginner: "Keep this to a single-step calculation (e.g. straightforward weight-based dose). No unit conversions needed.",
      Intermediate: "Require one unit conversion (e.g. mg to mL, kg to lb, or mcg to mg) as part of reaching the answer.",
      Advanced: "Require multi-step reasoning — e.g. a loading dose plus maintenance dose, or a dose adjustment calculation for the stated condition (renal/hepatic impairment, etc).",
    };
    const diffKey = difficultyInstructions[difficulty] ? difficulty : "Beginner";

    const trapInstructions = trapMode
      ? `\n- TRAP MODE IS ON: deliberately construct this scenario around ONE classic real-world dosing error a student could plausibly make (e.g. mg vs mcg confusion, misplaced decimal point, using an adult dose for a pediatric patient, confusing total daily dose with per-dose amount, or a unit conversion slip). Do not tell the student what the trap is — the scenario should just naturally invite that mistake if they're not careful. Remember which trap you set, since you will need to reveal it later.`
      : "";

    systemPrompt = `You are DoseDrill, a friendly and rigorous pharmacology tutor for medical and nursing students.
Your job is to generate ONE realistic drug-dosing practice scenario for a student to solve.

Rules:
- Use the drug, age, weight, and medical condition provided by the student.
- The condition is critical — factor in how it would affect dosing (e.g. renal impairment, hepatic impairment, pregnancy, pediatric considerations, allergies) if relevant.
- Difficulty level: ${diffKey}. ${difficultyInstructions[diffKey]}
- Present the scenario clearly and ask the student to calculate/state the correct dose.
- Do NOT reveal the correct answer yet. Only ask the question.
- Keep it realistic but concise (3-5 sentences).
- This is an EDUCATIONAL practice tool, not real clinical guidance. Do not imply this should be used to dose an actual patient.
- End with a clear question like: "What dose would you administer, and how did you calculate it?"${trapInstructions}`;

    userMessage = `Drug: ${drug}\nPatient age: ${age}\nPatient weight: ${weight}\nCondition: ${condition}\nCategory: ${category || "Adult - Standard"}\nDifficulty: ${diffKey}\nTrap mode: ${trapMode ? "ON" : "off"}\n\nGenerate the practice scenario now.`;
  } else if (mode === "check") {
    systemPrompt = `You are DoseDrill, a friendly and rigorous pharmacology tutor for medical and nursing students.
You previously gave the student a dosing scenario. Now grade their answer.

Rules:
- Determine the clinically appropriate dose/reasoning for the scenario given (considering age, weight, and especially the medical condition).
- Compare it to the student's answer.
- Start your reply with either "CORRECT:" or "INCORRECT:" (all caps, exact word).
- Then explain the correct dose and the reasoning clearly, in 3-5 sentences, including how the condition affected the calculation.
- Be encouraging but accurate. This is a study tool — clarity and correctness matter most.
- Do not imply this should be used for real patient care.${trapMode ? "\n- This scenario was built around a deliberate dosing trap (a classic real-world error type). After your explanation, add one short final sentence starting with \"Trap:\" that names the specific error this scenario was testing for, whether or not the student fell into it." : ""}`;

    userMessage = `Original scenario: ${question}\n\nStudent's answer: ${studentAnswer}\n\nGrade this now.`;
  } else {
    return res.status(400).json({ error: "Invalid mode" });
  }

  const callGemini = async () => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
        }),
      }
    );
    return response.json();
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    let data;
    let lastErrorMessage = "";
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      data = await callGemini();

      if (!data.error) break; // success

      lastErrorMessage = data.error.message || "";
      console.error(`Gemini API error (attempt ${attempt}/${maxAttempts}):`, data.error);

      // Transient errors are worth retrying; anything else, fail fast.
      const isTransient =
        data.error.status === "INTERNAL" ||
        data.error.status === "UNAVAILABLE" ||
        (data.error.code && data.error.code >= 500);

      if (!isTransient || attempt === maxAttempts) {
        return res.status(500).json({ error: lastErrorMessage || "Something went wrong talking to the AI. Please try again." });
      }

      await sleep(attempt * 700); // brief backoff: 0.7s, then 1.4s
    }

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
    return res.status(200).json({ result: text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong talking to the AI. Please try again." });
  }
}
 

      
      
