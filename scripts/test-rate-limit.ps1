# Script de test rapide des 3 routes protégées (rate limit)
# À lancer pendant que `npm run dev` tourne.

$baseUrl = "http://localhost:3000"

function Test-RouteRateLimit {
  param(
    [string]$Name,
    [string]$Url,
    [string]$Method = "POST",
    [string]$Body = "{}",
    [string]$ContentType = "application/json",
    [int]$Attempts = 10,
    [hashtable]$Headers = @{}
  )

  Write-Host ""
  Write-Host "=== Test: $Name ===" -ForegroundColor Cyan
  Write-Host "URL: $Url"

  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $response = Invoke-WebRequest `
        -Method $Method `
        -Uri $Url `
        -Headers $Headers `
        -Body $Body `
        -ContentType $ContentType `
        -ErrorAction Stop

      $remaining = $response.Headers["X-RateLimit-Remaining"]
      $reset = $response.Headers["X-RateLimit-Reset"]
      Write-Host ("[{0}] HTTP {1} | remaining={2} reset={3}" -f $i, [int]$response.StatusCode, $remaining, $reset)
    }
    catch {
      $status = $_.Exception.Response.StatusCode.value__
      $headers = $_.Exception.Response.Headers
      $remaining = $headers["X-RateLimit-Remaining"]
      $reset = $headers["X-RateLimit-Reset"]
      $retry = $headers["Retry-After"]
      Write-Host ("[{0}] HTTP {1} | remaining={2} reset={3} retry-after={4}" -f $i, $status, $remaining, $reset, $retry) -ForegroundColor Yellow
    }
  }
}

# 1) Reset password (limite: 5 / 15 min)
Test-RouteRateLimit `
  -Name "send-password-reset-email" `
  -Url "$baseUrl/api/auth/send-password-reset-email" `
  -Body '{"email":"test@example.com"}' `
  -Attempts 7

# 2) Envoi vérification (limite: 8 / 15 min)
# Note: sans token valide la route peut renvoyer 400/401, mais le rate limit compte quand même.
Test-RouteRateLimit `
  -Name "send-verification-email" `
  -Url "$baseUrl/api/auth/send-verification-email" `
  -Body '{"email":"test@example.com","firstName":"Test"}' `
  -Headers @{ Authorization = "Bearer fake-token" } `
  -Attempts 10

# 3) Upload analyses (limite: 12 / 60 s)
# Ici on envoie exprès un FormData minimal (sans fichier) pour éviter les vrais uploads,
# et vérifier uniquement que le rate limit finit en 429.
Write-Host ""
Write-Host "=== Test: analyses upload endpoint ===" -ForegroundColor Cyan

for ($i = 1; $i -le 14; $i++) {
  try {
    $form = New-Object System.Net.Http.MultipartFormDataContent
    $form.Add((New-Object System.Net.Http.StringContent("test-user")), "userId")

    $client = New-Object System.Net.Http.HttpClient
    $resp = $client.PostAsync("$baseUrl/api/analyses", $form).Result
    $remaining = $resp.Headers.GetValues("X-RateLimit-Remaining") -join ","
    $reset = $resp.Headers.GetValues("X-RateLimit-Reset") -join ","
    Write-Host ("[{0}] HTTP {1} | remaining={2} reset={3}" -f $i, [int]$resp.StatusCode, $remaining, $reset)
  } catch {
    Write-Host ("[{0}] Erreur: {1}" -f $i, $_.Exception.Message) -ForegroundColor Red
  }
}
