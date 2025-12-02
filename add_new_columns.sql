-- Add missing columns to participants table
-- Run this in your Supabase SQL Editor

-- Add leading_position column (boolean, default false)
ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS leading_position BOOLEAN DEFAULT false;

-- Add job_search_ai_use_before column (integer for percentage 0-100)
ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS job_search_ai_use_before INTEGER;

-- Add job_search_ai_use_after column (integer for percentage 0-100)
ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS job_search_ai_use_after INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN participants.leading_position IS 'Whether participant works in a leading position';
COMMENT ON COLUMN participants.job_search_ai_use_before IS 'Likelihood to use AI for job search (before chatbot), 0-100%';
COMMENT ON COLUMN participants.job_search_ai_use_after IS 'Likelihood to use AI for job search (after chatbot), 0-100%';

