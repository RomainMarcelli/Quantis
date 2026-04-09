# PDF Parser Runbook (Quantis)

## Purpose

This runbook is the single source of truth for the Quantis PDF parser.
It must be updated at each parser change (API contract, extraction logic, mapping, persistence, UI test flow).

Last update: 2026-04-09
Owner: Quantis app team

## Scope

Covered in this runbook:
- backend parser flow (Document AI -> analysis -> mapping -> persistence)
- API routes and response contracts
- progress tracking and loader behavior
- test and debug procedure
- known limits and troubleshooting

Out of scope:
- KPI formulas in `services/kpiEngine.ts`
- generic Excel parser pipeline (`/api/analyses`)

## Current Architecture

Main modules:
- `services/documentAI.ts`
- `services/pdfAnalysis.ts`
- `services/financialMapping.ts`
- `services/pdfAnalysisStore.ts`
- `services/pdfParserProgressStore.ts`
- `app/api/pdf-parser/route.ts`
- `app/pdf-parser-test/page.tsx`
- `components/ProcessingLoader.tsx`
- `hooks/useProcessingMetrics.ts`

### Data flow

1. Client uploads PDF to `POST /api/pdf-parser`.
2. API verifies Firebase auth token and user ownership.
3. API sends binary to Google Document AI.
4. API extracts structured financial data from Document AI output.
5. API maps extracted values to Quantis shape.
6. API computes diagnostics (`confidenceScore`, `warnings`).
7. API persists analysis under `users/{userId}/analyses/{analysisId}`.
8. API returns lightweight response for frontend.

### Progress flow

The parser progress is request-scoped via `requestId`:
- Upload phase: `0 -> 20`
- Document AI phase: `20 -> 70`
- Analysis + mapping phase: `70 -> 90`
- Save + finalize phase: `90 -> 100`

Endpoint for polling:
- `GET /api/pdf-parser?requestId=<uuid>`

## Environment Variables

Required for parser:
- `DOCUMENT_AI_PROJECT_ID`
- `DOCUMENT_AI_LOCATION`
- `DOCUMENT_AI_PROCESSOR_ID`

Auth options:
- Preferred: `GOOGLE_APPLICATION_CREDENTIALS`
- Alternative:
  - `DOCUMENT_AI_CLIENT_EMAIL`
  - `DOCUMENT_AI_PRIVATE_KEY`

Debug options:
- `DOCUMENT_AI_DEBUG_STRUCTURE=false|true`
- `PDF_PARSER_DEBUG=false|true`

Notes:
- Billing must be enabled on GCP project.
- The Document AI API must be enabled.

## API Contracts

## POST /api/pdf-parser

Auth:
- required (`Authorization: Bearer <firebase-id-token>`)

Body (`multipart/form-data`):
- `file` (required, PDF)
- `userId` (optional but checked against token uid)
- `requestId` (optional, used for progress polling)

Success (standard mode):
```json
{
  "success": true,
  "quantisData": {
    "ca": 1200000,
    "totalCharges": 900000,
    "netResult": 300000,
    "totalAssets": 5000000,
    "equity": 2000000,
    "debts": 3000000
  },
  "confidenceScore": 0.85,
  "warnings": [],
  "persistence": {
    "saved": true,
    "analysisId": "analysis-id",
    "warning": null
  }
}
```

Success (debug mode, `PDF_PARSER_DEBUG=true`):
- same payload + `debugData` with heavy extraction fields (`rawText`, `pages`, `entities`, `tables`, `detectedSections`, `financialData`).

Error:
```json
{
  "success": false,
  "error": "...",
  "detail": "..."
}
```

## GET /api/pdf-parser

Mode A - history:
- returns summarized analyses for authenticated user.

Mode B - progress:
- with `requestId` query param, returns progress snapshot:
```json
{
  "success": true,
  "progress": 70,
  "currentStep": "Analyse et mapping des donnees...",
  "status": "running",
  "error": null
}
```

## Firestore Persistence

Collection path:
- `users/{userId}/analyses/{analysisId}`

Stored fields:
- `createdAt`
- `source: "pdf"`
- `quantisData`
- `rawData`
  - `financialData`
  - `detectedSections`
  - `rawText`
  - `confidenceScore`
  - `warnings`

## Frontend Test Procedure

Manual test page:
- `/pdf-parser-test`

Checklist:
1. Login with a verified account.
2. Upload a valid PDF liasse.
3. Confirm loader steps move in order and never stays at 100 before completion.
4. Confirm response panel shows:
   - `quantisData`
   - `confidenceScore`
   - `warnings`
   - `analysisId`
5. Click `Charger historique PDF` and verify the new analysis appears.

## Diagnostics and Logs

Important log prefixes:
- `[api/pdf-parser]`
- `[document-ai]`
- `[pdf-analysis]`
- `[financial-mapping]`

Common warning rule:
- if `quantisData.ca < 0`, add warning:
  - `CA negatif detecte, verification recommandee.`

## Troubleshooting

### 500 PERMISSION_DENIED (billing)
Cause:
- GCP billing disabled or not propagated.

Action:
- enable billing on project and retry after a few minutes.

### 401 / 403 on parser route
Cause:
- missing/invalid Firebase token or mismatched `userId`.

Action:
- ensure user is logged in and `Authorization` header is sent.

### 404 on progress route
Cause:
- unknown or expired `requestId`.

Action:
- regenerate a new request via upload.

### Empty extraction (many null values)
Cause:
- unsupported PDF structure / OCR quality issues.

Action:
- check Document AI processor type and region.
- test with `PDF_PARSER_DEBUG=true` and inspect `debugData`.

## Known Limits (Current)

- Progress store is in-memory (process local, not distributed).
- PDF parsing still depends on source format quality.
- Some labels in uncommon liasses may still not be detected.

## Update Policy (Mandatory)

Each parser change must update this file:
- update date in header
- update changed API contract and examples
- update testing checklist if UX flow changes
- add troubleshooting note when new production issue appears

If a change is parser-related and this runbook was not updated, the task is considered incomplete.
