const ATTARI_QUESTIONS_MAP = {
	attari_1: "AI will make this world a better place.",
	attari_2: "I have strong negative emotions about AI.",
	attari_3: "I want to use technologies that rely on AI.",
	attari_4: "AI has more disadvantages than advantages.",
	attari_5: "I look forward to future AI developments.",
	attari_6: "AI offers solutions to many world problems.",
	attari_7: "I prefer technologies that do not feature AI.",
	attari_8: "I am afraid of AI.",
	attari_9: "I would rather choose a technology with AI than one without.",
	attari_10: "AI creates problems rather than solving them.",
	attari_11: "When I think about AI, I have mostly positive feelings.",
	attari_12: "I would rather avoid technologies that are based on AI.",
};

const TAI_QUESTIONS_MAP = {
	RCG1: "Detect suitability of applicants.",
	RCG2: "Record suitability of applicants.",
	RCG3: "Identify suitability of applicants.",
	PDC1: "Forecast the development of suitability of applicants.",
	PDC2: "Predict the development of suitability of applicants.",
	PDC3: "Calculate the development of suitability of applicants.",
	RCM1: "Recommend hiring of applicants.",
	RCM2: "Propose hiring of applicants.",
	RCM3: "Suggest hiring of applicants.",
	DSM1: "Decide on hiring of applicants.",
	DSM2: "Define hiring of applicants.",
	DSM3: "Preset hiring of applicants.",
};

const AGE_LABELS = {
	"under-25": "Under 25 years",
	"25-34": "25–34 years",
	"35-44": "35–44 years",
	"45-54": "45–54 years",
	"55-64": "55–64 years",
	"65-plus": "65 years or older",
};

const GENDER_LABELS = {
	female: "Female",
	male: "Male",
	miscellaneous: "Miscellaneous",
	"prefer-not-to-say": "Prefer not to say",
};

const EDUCATION_LABELS = {
	"secondary-1": "Secondary level I",
	"secondary-2": "Secondary level II",
	vocational: "Vocational training/apprenticeship",
	bachelor: "Bachelor",
	master: "Masters degree",
	doctorate: "Doctorate",
	other: "Other degree",
};

function formatDemographicValue(field, value) {
	if (!value) return "";
	switch (field) {
		case "age_category":
			return AGE_LABELS[value] || value;
		case "gender":
			return GENDER_LABELS[value] || value;
		case "education":
			return EDUCATION_LABELS[value] || value;
		case "nationality":
		case "occupation":
			return value
				.split("-")
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" ");
		default:
			return value;
	}
}

function escapeCSV(value) {
	if (value === null || value === undefined) return "";
	const str = String(value);
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

export function rowsToCsv(rows) {
	if (!rows || rows.length === 0) return "";

	// Define base columns
	const baseColumns = [
		"Participant ID",
		"Consent Date",
		"Age Category",
		"Gender",
		"Nationality",
		"Education",
		"Occupation",
		"Recruitment Experience",
		"Recruitment Role",
	];

	// Add ATTARI question columns
	const attariColumns = Object.entries(ATTARI_QUESTIONS_MAP).map(([id, question]) => `ATTARI: ${question}`);

	// Add TAI question columns
	const taiColumns = Object.entries(TAI_QUESTIONS_MAP).map(([id, question]) => `TAI: ${question}`);

	// Add other columns
	const otherColumns = [
		"Screening Text",
		"Baseline AI Use",
		"Condition",
		"Post-Test AI Use",
		"Post-Test Change Explanation",
		"Completed",
		"Total Chat Messages",
	];

	const headers = [...baseColumns, ...attariColumns, ...taiColumns, ...otherColumns];

	const lines = [headers.map(escapeCSV).join(",")];

	for (const row of rows) {
		const values = [];

		// Base columns
		values.push(row.id || "");
		values.push(row.consent_at ? new Date(row.consent_at).toLocaleString() : "");
		values.push(formatDemographicValue("age_category", row.age_category));
		values.push(formatDemographicValue("gender", row.gender));
		values.push(formatDemographicValue("nationality", row.nationality));
		values.push(formatDemographicValue("education", row.education));
		values.push(formatDemographicValue("occupation", row.occupation));
		values.push(row.recruitment_experience ? "Yes" : "No");
		values.push(row.recruitment_role || "");

		// ATTARI responses
		const attari = row.attari || {};
		for (const id of Object.keys(ATTARI_QUESTIONS_MAP)) {
			values.push(attari[id] !== undefined ? attari[id] : "");
		}

		// TAI responses
		const tai = row.tai || {};
		for (const id of Object.keys(TAI_QUESTIONS_MAP)) {
			values.push(tai[id] !== undefined ? tai[id] : "");
		}

		// Other columns
		values.push(row.screening_text || "");
		values.push(row.baseline_use !== undefined ? row.baseline_use : "");
		values.push(row.condition || "");
		values.push(row.post_use !== undefined ? row.post_use : "");
		values.push(row.post_change || "");
		values.push(row.completed ? "Yes" : "No");
		values.push(row.chat ? row.chat.length : 0);

		lines.push(values.map(escapeCSV).join(","));
	}

	return lines.join("\n");
}
