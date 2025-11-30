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

// Test database connection
app.get("/api/test-db", async (req, res) => {
	try {
		const { data, error } = await supabase.from("participants").select("id").limit(1);
		if (error) {
			console.error("Database test error:", error);
			return res.status(500).json({ 
				error: "Database connection failed", 
				details: error.message,
				code: error.code
			});
		}
		res.json({ status: "ok", message: "Database connection successful", data });
	} catch (err) {
		console.error("Database test exception:", err);
		res.status(500).json({ error: "Database test failed", details: err.message });
	}
});

// Create participant
app.post("/api/participant", async (req, res) => {
	try {
		const id = uuidv4();
		const { consent_at, demographic } = req.body;

		console.log("Creating participant with data:", { id, consent_at, demographic });

		// Build participant data object, only including fields that exist
		const participantData = {
			id,
			consent_at,
		};

		// Only add demographic fields if they exist and are not empty strings
		if (demographic) {
			if (demographic.age !== undefined && demographic.age !== "") {
				participantData.age_category = demographic.age;
			}
			if (demographic.gender !== undefined && demographic.gender !== "") {
				participantData.gender = demographic.gender;
			}
			if (demographic.nationality !== undefined && demographic.nationality !== "") {
				participantData.nationality = demographic.nationality;
			}
			if (demographic.education !== undefined && demographic.education !== "") {
				participantData.education = demographic.education;
			}
			if (demographic.occupation !== undefined && demographic.occupation !== "") {
				participantData.occupation = demographic.occupation;
			}
			if (demographic.recruitment_experience !== undefined) {
				participantData.recruitment_experience = demographic.recruitment_experience;
			}
			if (demographic.recruitment_role !== undefined && demographic.recruitment_role !== "") {
				participantData.recruitment_role = demographic.recruitment_role;
			}
		}

		console.log("Inserting participant data:", participantData);

		const { data, error } = await supabase.from("participants").insert(participantData);

		if (error) {
			console.error("Supabase error creating participant:", JSON.stringify(error, null, 2));
			console.error("Error code:", error.code);
			console.error("Error message:", error.message);
			console.error("Error details:", error.details);
			console.error("Error hint:", error.hint);
			return res.status(500).json({ 
				error: "server error", 
				details: error.message,
				code: error.code,
				hint: error.hint
			});
		}

		console.log("Participant created successfully:", id);
		res.json({ participant_id: id });
	} catch (err) {
		console.error("Unexpected error creating participant:", err);
		console.error("Error stack:", err.stack);
		res.status(500).json({ 
			error: "server error", 
			details: err.message,
			stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
		});
	}
});

// Update demographics
app.post("/api/demographics", async (req, res) => {
	try {
		const { participant_id, demographic } = req.body;

		const updateData = {
			age_category: demographic?.age || null,
			gender: demographic?.gender || null,
			nationality: demographic?.nationality || null,
			education: demographic?.education || null,
			occupation: demographic?.occupation || null,
			recruitment_experience: demographic?.recruitment_experience || false,
			recruitment_role: demographic?.recruitment_role || null,
		};

		// Only include prolific_id fields if they are provided and not empty strings
		if (demographic?.prolific_id !== undefined && demographic.prolific_id !== "") {
			updateData.prolific_id = demographic.prolific_id;
		}
		if (demographic?.no_prolific_id !== undefined) {
			updateData.no_prolific_id = demographic.no_prolific_id;
		}
		if (demographic?.leading_position !== undefined) {
			updateData.leading_position = demographic.leading_position;
		}

		// Try to update, if prolific_id columns don't exist, update without them
		const { error } = await supabase.from("participants").update(updateData).eq("id", participant_id);

		if (error) {
			// If error is about missing columns, try without prolific_id fields
			if (error.message && (error.message.includes("prolific_id") || error.message.includes("column"))) {
				console.warn("Prolific ID columns may not exist, updating without them:", error.message);
				const updateDataWithoutProlific = { ...updateData };
				delete updateDataWithoutProlific.prolific_id;
				delete updateDataWithoutProlific.no_prolific_id;
				
				const { error: retryError } = await supabase
					.from("participants")
					.update(updateDataWithoutProlific)
					.eq("id", participant_id);
				
				if (retryError) {
					console.error("Supabase error updating demographics:", retryError);
					throw retryError;
				}
			} else {
				console.error("Supabase error updating demographics:", error);
				throw error;
			}
		}
		res.json({ ok: true });
	} catch (err) {
		console.error("Error updating demographics:", err);
		res.status(500).json({ error: "server error", details: err.message });
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
		const { participant_id, screening_text, baseline_use, job_search_ai_use_before } = req.body;
		const excluded = (screening_text || "").trim().toLowerCase() === "no";

		const updateData = {
			screening_text,
			baseline_use,
		};

		// Only include job_search_ai_use_before if provided
		if (job_search_ai_use_before !== undefined) {
			updateData.job_search_ai_use_before = job_search_ai_use_before;
		}

		const { error: updateError } = await supabase
			.from("participants")
			.update(updateData)
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
		const { participant_id, post_use, post_change, job_search_ai_use_after } = req.body;

		const updateData = {
			post_use,
			post_change,
			completed: true,
		};

		// Only include job_search_ai_use_after if provided
		if (job_search_ai_use_after !== undefined) {
			updateData.job_search_ai_use_after = job_search_ai_use_after;
		}

		const { error } = await supabase
			.from("participants")
			.update(updateData)
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
