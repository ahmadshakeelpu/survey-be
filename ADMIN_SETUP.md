# Admin Dashboard Setup Guide

## Overview
The admin dashboard allows you to view, search, filter, and export all participant data from the AI survey study.

## Backend Setup

### Environment Variables
Add the following to your `survey-be/.env` file:

```env
ADMIN_EXPORT_TOKEN=your_secure_admin_password_here
```

This token will be used as the admin password for accessing the dashboard.

### API Endpoints Added

1. **POST /api/admin/login** - Admin authentication
2. **GET /api/admin/participants** - List all participants with filters
3. **GET /api/admin/participants/:id** - Get detailed participant information
4. **GET /api/admin/stats** - Get statistics (total, completed, by condition, etc.)
5. **GET /api/admin/export** - Export all data as CSV

All admin endpoints require the `x-admin-token` header with the value matching `ADMIN_EXPORT_TOKEN`.

## Frontend Access

### URL
Navigate to: `http://localhost:3000/admin`

### Login
Enter the admin password (same as `ADMIN_EXPORT_TOKEN` from your backend `.env` file)

## Features

### Dashboard Overview
- **Statistics Cards**: Total participants, completed studies, control/experimental groups, excluded participants
- **Search**: Search by participant ID, gender, nationality, occupation
- **Filters**: Filter by condition (control/experimental) and completion status
- **Export**: Download all data as CSV file
- **Participant List**: View all participants with key information

### Participant Detail View
Click "View Details" on any participant to see:
- Basic information (consent date, status, condition)
- Demographics (age, gender, nationality, education, occupation, recruitment experience)
- Screening responses and baseline AI use
- ATTARI scale responses
- TAI scale responses
- Complete chat history with timestamps
- Post-test responses

## Security Notes

1. **Token Storage**: Admin token is stored in browser localStorage after login
2. **Session Persistence**: Token remains valid until logout or until manually cleared
3. **Automatic Logout**: Unauthorized requests automatically clear the token and redirect to login

## Usage Instructions

### Viewing Participants
1. Login with admin password
2. Use search and filters to find specific participants
3. Click "View Details" to see complete participant information

### Exporting Data
1. Click the "Export CSV" button in the dashboard header
2. File will download with filename format: `participants_YYYY-MM-DD.csv`
3. CSV includes all participant data fields

### Logout
Click the "Logout" button in the top right to end your session and clear the stored token.

## Development

### Backend (survey-be)
- Server runs on port 8000 by default
- Admin routes are in `server.js`
- Uses middleware for authentication

### Frontend (survey-fe)
- Admin pages located in `app/admin/`
- API functions in `lib/api.ts` under `api.admin`
- Uses Next.js 14 with App Router
- Styling with Tailwind CSS

## Troubleshooting

### Cannot Login
- Verify `ADMIN_EXPORT_TOKEN` is set in backend `.env` file
- Ensure backend server is running on correct port
- Check `NEXT_PUBLIC_API_BASE` environment variable in frontend

### Unauthorized Errors
- Check that the token matches between frontend and backend
- Clear localStorage and login again
- Restart backend server after changing `.env` file

### Missing Data
- Verify Supabase connection is working
- Check that participants table exists and has correct schema
- Review backend logs for errors

