import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import supabase from "./supabase.js";
import dotenv from "dotenv";
import { CONTROL_PROMPT, EXPERIMENTAL_PROMPT } from "./prompts.js";
import { rowsToCsv } from "./utils.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(morgan("dev")); // Log all HTTP requests
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Health check
app.get("/api/health", (req, res) => {
	res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Create participant
app.post("/api/participant", async (req, res) => {
	try {
		const id = uuidv4();
		const { consent_at, demographic } = req.body;

		const { data, error } = await supabase.from("participants").insert({
			id,
			consent_at,
			age_category: demographic?.age,
			gender: demographic?.gender,
			nationality: demographic?.nationality,
			education: demographic?.education,
			occupation: demographic?.occupation,
			recruitment_experience: demographic?.recruitment_experience,
			recruitment_role: demographic?.recruitment_role,
			prolific_id: demographic?.prolific_id,
			no_prolific_id: demographic?.no_prolific_id,
		});

		if (error) throw error;
		res.json({ participant_id: id });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

// Update demographics
app.post("/api/demographics", async (req, res) => {
	try {
		const { participant_id, demographic } = req.body;

		const { error } = await supabase
			.from("participants")
			.update({
				age_category: demographic?.age,
				gender: demographic?.gender,
				nationality: demographic?.nationality,
				education: demographic?.education,
				occupation: demographic?.occupation,
				recruitment_experience: demographic?.recruitment_experience,
				recruitment_role: demographic?.recruitment_role,
				prolific_id: demographic?.prolific_id,
				no_prolific_id: demographic?.no_prolific_id,
			})
			.eq("id", participant_id);

		if (error) throw error;
		res.json({ ok: true });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

// Save scales (attari, tai)
app.post("/api/scales", async (req, res) => {
	try {
		const { participant_id, attari, tai } = req.body;

		const { error } = await supabase.from("participants").update({ attari, tai }).eq("id", participant_id);

		if (error) throw error;
		res.json({ ok: true });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

// Screening & baseline
app.post("/api/screening", async (req, res) => {
	try {
		const { participant_id, screening_text, baseline_use } = req.body;
		const excluded = (screening_text || "").trim().toLowerCase() === "no";

		const { error: updateError } = await supabase
			.from("participants")
			.update({ screening_text, baseline_use })
			.eq("id", participant_id);

		if (updateError) throw updateError;

		if (excluded) return res.json({ excluded: true });

		const condition = Math.random() < 0.5 ? "control" : "experimental";

		const { error: conditionError } = await supabase
			.from("participants")
			.update({ condition })
			.eq("id", participant_id);

		if (conditionError) throw conditionError;
		res.json({ excluded: false, condition });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

// Initial greeting endpoint
app.post("/api/chat/greeting", async (req, res) => {
	try {
		const { participant_id, round } = req.body;

		const { data, error } = await supabase
			.from("participants")
			.select("condition, screening_text, chat")
			.eq("id", participant_id)
			.single();

		if (error) throw error;
		if (!data) return res.status(404).json({ error: "participant not found" });

		const condition = data.condition || "control";
		const screening_text = data.screening_text || "";
		const existingChat = data.chat || [];

		// Build system prompt with context
		let systemPrompt = condition === "control" ? CONTROL_PROMPT : EXPERIMENTAL_PROMPT;
		if (condition === "experimental" && screening_text) {
			systemPrompt = systemPrompt.replace("PARTICIPANT_CONCERNS", screening_text);
		}

		// Build message history for context
		const messages = [{ role: "system", content: systemPrompt }];

		// Add previous conversation rounds to maintain context
		if (existingChat && existingChat.length > 0) {
			existingChat.forEach((chatEntry) => {
				if (chatEntry.round < round) {
					messages.push({ role: "user", content: chatEntry.user_message });
					messages.push({ role: "assistant", content: chatEntry.reply });
				}
			});
		}

		// Add a prompt for initial greeting based on round
		const greetingPrompt =
			round === 1
				? condition === "control"
					? "Start Round 1 with a short, neutral introductory question about professional goals or current working life."
					: "Start Round 1 by briefly reflecting the participant's concerns and explaining at a high level how AI assistance works in recruitment. End with an open question."
				: round === 2
				? condition === "control"
					? "Start Round 2 with a light deepening question about strengths or areas of learning. Keep it neutral."
					: "Start Round 2 by naming specific mechanisms and protective measures. Ask about missing protective measures."
				: "Start Round 3 with a summary (control: summarize previous points and offer two neutral practical ideas; experimental: summarize the setup and ask final acceptance question).";

		messages.push({ role: "user", content: greetingPrompt });

		const completion = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			messages,
			max_tokens: 350,
		});
		const reply = completion.choices[0].message.content;

		res.json({ reply, round });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
	try {
		const { participant_id, round, user_message } = req.body;

		const { data, error } = await supabase
			.from("participants")
			.select("condition, screening_text, chat")
			.eq("id", participant_id)
			.single();

		if (error) throw error;
		if (!data) return res.status(404).json({ error: "participant not found" });

		const condition = data.condition || "control";
		const screening_text = data.screening_text || "";
		const existingChat = data.chat || [];

		// Build system prompt with context
		let systemPrompt = condition === "control" ? CONTROL_PROMPT : EXPERIMENTAL_PROMPT;
		if (condition === "experimental" && screening_text) {
			systemPrompt = systemPrompt.replace("PARTICIPANT_CONCERNS", screening_text);
		}

		// Build message history for context
		const messages = [{ role: "system", content: systemPrompt }];

		// Add previous conversation rounds to maintain context
		if (existingChat && existingChat.length > 0) {
			existingChat.forEach((chatEntry) => {
				if (chatEntry.round < round) {
					messages.push({ role: "user", content: chatEntry.user_message });
					messages.push({ role: "assistant", content: chatEntry.reply });
				}
			});
		}

		// Add current user message
		messages.push({ role: "user", content: user_message });

		const completion = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			messages,
			max_tokens: 350,
		});
		const reply = completion.choices[0].message.content;

		const updated = existingChat.concat([{ round, user_message, reply, ts: new Date() }]);

		const { error: chatError } = await supabase.from("participants").update({ chat: updated }).eq("id", participant_id);

		if (chatError) throw chatError;
		res.json({ reply });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

// Complete
app.post("/api/complete", async (req, res) => {
	try {
		const { participant_id, post_use, post_change } = req.body;

		const { error } = await supabase
			.from("participants")
			.update({ post_use, post_change, completed: true })
			.eq("id", participant_id);

		if (error) throw error;
		res.json({ ok: true });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

// Admin middleware
const adminAuth = (req, res, next) => {
	const token = req.headers["x-admin-token"];
	if (token !== process.env.ADMIN_EXPORT_TOKEN) {
		return res.status(401).json({ error: "unauthorized" });
	}
	next();
};

// Admin login
app.post("/api/admin/login", async (req, res) => {
	try {
		const { password } = req.body;
		if (password === process.env.ADMIN_EXPORT_TOKEN) {
			res.json({ success: true, token: process.env.ADMIN_EXPORT_TOKEN });
		} else {
			res.status(401).json({ error: "Invalid password" });
		}
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

// Admin list participants
app.get("/api/admin/participants", adminAuth, async (req, res) => {
	try {
		const { data, error } = await supabase
			.from("participants")
			.select("*")
			.order("consent_at", { ascending: false });

		if (error) throw error;
		res.json({ participants: data });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

// Admin get participant details
app.get("/api/admin/participants/:id", adminAuth, async (req, res) => {
	try {
		const { id } = req.params;
		const { data, error } = await supabase.from("participants").select("*").eq("id", id).single();

		if (error) throw error;
		if (!data) return res.status(404).json({ error: "participant not found" });

		res.json({ participant: data });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

// Admin export
app.get("/api/admin/export", adminAuth, async (req, res) => {
	try {
		const { data, error } = await supabase.from("participants").select("*");

		if (error) throw error;
		const csv = rowsToCsv(data);
		res.setHeader("Content-Type", "text/csv");
		res.setHeader("Content-Disposition", "attachment; filename=participants_export.csv");
		res.send(csv);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

// Admin stats
app.get("/api/admin/stats", adminAuth, async (req, res) => {
	try {
		const { data, error } = await supabase.from("participants").select("*");

		if (error) throw error;

		const stats = {
			total: data.length,
			completed: data.filter((p) => p.completed).length,
			control: data.filter((p) => p.condition === "control").length,
			experimental: data.filter((p) => p.condition === "experimental").length,
			excluded: data.filter((p) => p.screening_text?.toLowerCase() === "no").length,
		};

		res.json({ stats });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "server error" });
	}
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
