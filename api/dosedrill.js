// This file runs on the server (Vercel), NOT in the user's browser.
// That's important: it's the only safe place to use your secret API key.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  const { mode, drug, age, weight, condition, studentAnswer, question } = req.body;

  // System prompt: this is the instruction set that shapes how the AI behaves.
  // mode "generate" -> AI creates a new practice question
  // mode "check"    -> AI grades the student's answer
  let systemPrompt = "";
  let userMessage = "";

  if (mode === "generate") {
    systemPrompt = `You are DoseDrill, a friendly and rigorous pharmacology tutor for medical and nursing students.
Your job is to generate ONE realistic drug-dosing practice scenario for a student to solve.

Rules:
- Use the drug, age, weight, and medical condition provided by the student.
- The condition is critical — factor in how it would affect dosing (e.g. renal impairment, hepatic impairment, pregnancy, pediatric considerations, allergies) if relevant.
- Present the scenario clearly and ask the student to calculate/state the correct dose.
- Do NOT reveal the correct answer yet. Only ask the question.
- Keep it realistic but concise (3-5 sentences).
- This is an EDUCATIONAL practice tool, not real clinical guidance. Do not imply this should be used to dose an actual patient.
- End with a clear question like: "What dose would you administer, and how did you calculate it?"`;

    userMessage = `Drug: ${drug}\nPatient age: ${age}\nPatient weight: ${weight}\nCondition: ${condition}\n\nGenerate the practice scenario now.`;
  } else if (mode === "check") {
    systemPrompt = `You are DoseDrill, a friendly and rigorous pharmacology tutor for medical and nursing students.
You previously gave the student a dosing scenario. Now grade their answer.

Rules:
- Determine the clinically appropriate dose/reasoning for the scenario given (considering age, weight, and especially the medical condition).
- Compare it to the student's answer.
- Start your reply with either "CORRECT:" or "INCORRECT:" (all caps, exact word).
- Then explain the correct dose and the reasoning clearly, in 3-5 sentences, including how the condition affected the calculation.
- Be encouraging but accurate. This is a study tool — clarity and correctness matter most.
- Do not imply this should be used for real patient care.`;

    userMessage = `Original scenario: ${question}\n\nStudent's answer: ${studentAnswer}\n\nGrade this now.`;
  } else {
    return res.status(400).json({ error: "Invalid mode" });
  }

  try {
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

    const data = await response.json();

    if (data.error) {
      console.error("Gemini API error:", data.error);
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
    return res.status(200).json({ result: text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong talking to the AI." });
  }
}
