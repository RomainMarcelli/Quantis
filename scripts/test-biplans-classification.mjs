// Script de simulation : classifie les pages BI-PLANS avec les marqueurs actuels.
// Usage : node scripts/test-biplans-classification.mjs
// Ne nécessite PAS le fichier PDF — utilise les textes connus des pages.

const FISCAL_PRIORITY_MARKERS = [
  /DGFiP\s*N[°o°]?/i,
  /DGFIP\s*N[°o°]?/i,
  /205[0-5]-SD/i,
  /BILAN\s*[—–-]\s*ACTIF/i,
  /BILAN\s*[—–-]\s*PASSIF/i,
  /COMPTE DE RÉSULTAT DE L'EXERCICE/i,
  /Formulaire\s+obligatoire/i,
  /N[°o°]\s*15949/i
];

const POSITIVE_MARKERS = [
  /bilan\s*[—–-]?\s*actif/i,
  /bilan\s*[—–-]?\s*passif/i,
  /compte\s+de\s+r[ée]sultat/i,
  /r[ée]sultat\s+d['']\s*exploitation/i,
  /total\s+g[ée]n[ée]ral\s+de\s+l['']?\s*actif/i,
  /total\s+g[ée]n[ée]ral\s+du\s+passif/i,
  /total\s+des\s+produits/i,
  /total\s+des\s+charges/i,
  /DGFiP\s*N[°o]?\s*205[012]/i,
  /ventes\s+de\s+marchandises/i,
  /chiffre\s+d['']\s*affaires/i,
  /BILAN\s+AU\b/i,
  /COMPTE\s+DE\s+RESULTAT\s+AU\b/i,
  /CHIFFRES?\s+D['']\s*AFFAIRES?\s+NETS?/i,
  /ACTIF\s+IMMOBILIS[ÉE]/i,
  /CAPITAUX\s+PROPRES/i,
  /CHARGES\s+D['']\s*EXPLOITATION/i
];

const NEGATIVE_MARKERS = [
  /rapport\s+du\s+commissaire\s+aux\s+comptes/i,
  /tableau\s+de\s+variation\s+des\s+capitaux\s+propres/i,
  /r[ée]partition\s+des\s+effectifs/i,
  /filiales\s+et\s+participations/i,
  /engagements\s+hors\s+bilan/i,
  /proc[èe]s[-\s]*verbal/i,
  /approbation\s+des\s+comptes\s+sociaux/i,
  /assembl[ée]e\s+g[ée]n[ée]rale\s+ordinaire/i,
  /Plaquette\s+du\b/i,
  /VOTRE\s+EXPERT[—–-]?\s*COMPTABLE/i,
  /SOLDES\s+INTERMEDIAIRES\s+DE\s+GESTION/i,
  /COMPTES\s+ANNUELS\s+DETAILLES/i,
  /BILAN\s+ACTIF\s+DETAILLE/i,
  /BILAN\s+PASSIF\s+DETAILLE/i,
  /COMPTE\s+DE\s+RESULTAT\s+DETAILLE/i,
  /DOSSIER\s+DE\s+GESTION/i,
  /ANNEXE\s+COMPTABLE/i,
  /Mission de présentation des comptes/i,
  /SIG sur/i,
  /SIG détaillés/i
];

function classifyPage(text) {
  if (!text || text.trim().length === 0) return { kept: false, reason: "empty" };
  for (const m of FISCAL_PRIORITY_MARKERS) {
    if (m.test(text)) return { kept: true, reason: `FISCAL: ${m.source}` };
  }
  const hasPositive = POSITIVE_MARKERS.some(m => m.test(text));
  if (!hasPositive) return { kept: false, reason: "no_positive" };
  for (const m of NEGATIVE_MARKERS) {
    if (m.test(text)) return { kept: false, reason: `NEGATIVE: ${m.source}` };
  }
  return { kept: true, reason: "positive_marker" };
}

// Texte-clé de chaque page BI-PLANS (extrait du PDF joint)
const pages = [
  { n: 1, text: "Bordereau attestant l'exactitude des informations BOBIGNY Documents comptables BI-PLANS" },
  { n: 2, text: "BI-PLANS 16 Rue MARCEAU Plaquette du 01/01/2024 au 31/12/2024 acora VOTRE EXPERT-COMPTABLE PARTENAIRE" },
  { n: 3, text: "SOMMAIRE Bilan actif Bilan passif Compte de résultat Comptes annuels detaillés Bilan actif détaillé Bilan passif détaillé Compte de résultat détaillé Dossier de gestion SIG sur 3 ans SIG détaillés sur 3 ans Annexe comptable Liasse fiscale" },
  { n: 4, text: "Attestation ATTESTATION DE PRESENTATION DES COMPTES ANNUELS Mission de présentation des comptes Total du bilan 454 030 Chiffre d'affaires 752 298 Résultat net comptable 24 219" },
  { n: 5, text: "COMPTES ANNUELS" },
  { n: 6, text: "BILAN ACTIF BI-PLANS ACTIF IMMOBILISE Constructions 107 459 TOTAL ACTIF IMMOBILISE 347 379 220 734 126 645 ACTIF CIRCULANT Clients et comptes rattachés 327 329 Disponibilités 15 482 TOTAL ACTIF CIRCULANT 382 315 TOTAL ACTIF GENERAL 729 694 275 664 454 030 Mission de présentation des comptes" },
  { n: 7, text: "BILAN PASSIF BI-PLANS CAPITAUX PROPRES Capital social 7 622 Réserve légale 762 Autres réserves 200 745 Résultat de l'exercice 24 219 Situation Nette 233 349 TOTAL CAPITAUX PROPRES 233 349 DETTES Emprunts 58 806 Dettes fournisseurs 34 492 Dettes fiscales et sociales 112 962 TOTAL DETTES 220 681 TOTAL PASSIF GENERAL 454 030 Mission de présentation des comptes" },
  { n: 8, text: "COMPTE DE RESULTAT BI-PLANS Produits d'exploitation France Export Production vendue services 752 298 Chiffre d'affaires net 752 298 Total des produits d'exploitation 768 398 Charges d'exploitation Autres achats et charges externes 266 574 Salaires et traitements 282 989 Charges sociales 121 483 Dotations d'exploitation 29 356 Total des charges d'exploitations 778 419 RESULTAT D'EXPLOITATION -10 021 Mission de présentation des comptes" },
  { n: 9, text: "COMPTE DE RESULTAT BI-PLANS Charges Financières Intérêts et charges assimilées 2 586 Total des charges financières 2 586 RESULTAT FINANCIER -2 586 RESULTAT COURANT AVANT IMPOTS -12 607 Produits Exceptionnels 68 000 Charges Exceptionnelles 26 854 RESULTAT EXCEPTIONNEL 41 146 Impôts sur les bénéfices 4 320 BENEFICE OU PERTE 24 219 Mission de présentation des comptes" },
  { n: 10, text: "COMPTES ANNUELS DETAILLES" },
  { n: 11, text: "BILAN ACTIF DETAILLE BI-PLANS ACTIF IMMOBILISE Immobilisations incorporelles LOGICIELS 669 Immobilisations corporelles AGENCEMENTS CONSTRUCTIONS 107 458 TOTAL ACTIF IMMOBILISE 126 645 100 353 ACTIF CIRCULANT Clients et comptes rattachés 272 398 Mission de présentation des comptes" },
  { n: 12, text: "BILAN ACTIF DETAILLE BI-PLANS Trésorerie Valeurs mobilières Disponibilités 15 482 TOTAL ACTIF CIRCULANT 327 384 347 518 TOTAL ACTIF GENERAL 454 030 447 871 Mission de présentation des comptes" },
  { n: 13, text: "BILAN PASSIF DETAILLE BI-PLANS CAPITAUX PROPRES Capital social 7 622 Réserve légale 762 Autres réserves 200 744 Résultat de l'exercice 24 219 Situation Nette 233 348 TOTAL CAPITAUX PROPRES 233 348 DETTES Emprunts 58 805 Dettes fournisseurs 34 492 Dettes fiscales et sociales 112 961 TOTAL DETTES 220 681 TOTAL PASSIF GENERAL 454 030 Mission de présentation des comptes" },
  { n: 14, text: "BILAN PASSIF DETAILLE BI-PLANS TVA A DECAISSER TVA DEDUCTIBLE TVA SUR IMMO TVA COLLECTEE TVA PRODUITS A RECEVOIR Autres dettes TOTAL DETTES 220 681 TOTAL PASSIF GENERAL 454 030 Mission de présentation des comptes" },
  { n: 15, text: "COMPTE DE RESULTAT DETAILLE BI-PLANS Produits d'exploitation Production vendue services 752 298 Chiffre d'affaires net 752 298 Total des produits d'exploitation 768 398 Charges d'exploitation Achats de matières premières 3 063 Autres achats et charges externes 266 574 Salaires et traitements 282 989 Charges sociales 121 482 Dotations aux amortissements 29 356 Autres charges 50 071 Total des charges d'exploitations 778 419 RESULTAT D'EXPLOITATION -10 020 Mission de présentation des comptes" },
  { n: 16, text: "COMPTE DE RESULTAT DETAILLE BI-PLANS Charges Financières Intérêts et charges assimilées 2 585 Total des charges financières 2 585 RESULTAT FINANCIER -2 585 Impôts taxes et versements assimilés 24 881 DOTATION D'EXPLOITATION 29 356 Mission de présentation des comptes" },
  { n: 17, text: "COMPTE DE RESULTAT DETAILLE BI-PLANS Charges Financières RESULTAT FINANCIER -2 585 RESULTAT COURANT AVANT IMPOTS -12 606 Produits Exceptionnels 68 000 Charges Exceptionnelles 26 854 RESULTAT EXCEPTIONNEL 41 145 Impôts sur les bénéfices 4 320 TOTAL DES PRODUITS 836 398 TOTAL DES CHARGES 812 179 BENEFICE OU PERTE 24 219 Mission de présentation des comptes" },
  { n: 18, text: "DOSSIER DE GESTION" },
  { n: 19, text: "SOLDES INTERMEDIAIRES DE GESTION BI-PLANS Production vendue 752 298 Chiffre d'affaires 752 298 Marge Brute Globale 671 524 Valeur ajoutée 482 660 Excédent brut d'exploitation 53 307 Résultat d'exploitation -10 020 Mission de présentation des comptes" },
  { n: 20, text: "SOLDES INTERMEDIAIRES DE GESTION DETAILLES BI-PLANS Production vendue 752 298 Chiffre d'affaires 752 298 Mission de présentation des comptes" },
  { n: 21, text: "SOLDES INTERMEDIAIRES DE GESTION DETAILLES BI-PLANS Valeur ajoutée 482 660 Excédent brut d'exploitation 53 307 Résultat d'exploitation -10 020 Résultat net de l'exercice 24 219 Mission de présentation des comptes" },
  { n: 22, text: "SOLDES INTERMEDIAIRES DE GESTION DETAILLES BI-PLANS Reprises sur amortissements Transferts de charges Dotations Résultat d'exploitation -10 020 Résultat financier -2 585 Résultat courant avant impôts -12 606 Résultat exceptionnel 41 145 Résultat net de l'exercice 24 219 Mission de présentation des comptes" },
  { n: 23, text: "ANNEXE COMPTABLE" },
  { n: 24, text: "BI-PLANS Annexe des Comptes de l'exercice clos le 31/12/2024 Annexe au bilan avant répartition bénéfice net comptable de 24 219€" },
  { n: 25, text: "BI-PLANS Immobilisations Corporelles et Incorporelles" },
  { n: 26, text: "BI-PLANS Constructions 107 459 Matériel de transport 110 941 Total Immobilisations Corporelles 321 601 82 203" },
  { n: 27, text: "BI-PLANS Amortissements Constructions sur sol propre 107 459 Instal. techniques 4 460 Total Amortissement Corporelles 269 364 TOTAUX 270 033" },
  { n: 28, text: "BI-PLANS Dépréciation Actif Immobilisé TOTAUX" },
  { n: 29, text: "BI-PLANS Frais de Recherche et de Développement Autres Participations Dépréciations Actif" },
  { n: 30, text: "BI-PLANS Produits à Recevoir Facture à Établir 21 600 TOTAL 21 600" },
  { n: 31, text: "BI-PLANS État des Créances Autres immobilisations financières 48 117 Clients douteux 65 916 TOTAUX 414 844" },
  { n: 32, text: "BI-PLANS Charges Constatées d'Avance CCA ENGIE 553 PASSIF Capitaux propres Composition du capital social 500 parts Capital Social 7 622 Réserve légale 762 Autres réserves 200 745 Résultat de l'exercice 24 219" },
  { n: 33, text: "BI-PLANS État des Dettes Emprunts et dettes 58 806 Fournisseurs et comptes rattachés 34 492 Sécurité sociale 20 521 TVA 70 485 Autres dettes 13 060 TOTAUX 220 681" },
  { n: 34, text: "BI-PLANS Charges à Payer Congés payés 2 644 Charges sociales 1 058 TOTAL 37 055 COMPTE DE RÉSULTAT Chiffre d'affaires 752 298" },
  { n: 35, text: "BI-PLANS Résultat Financier Intérêts et charges assimilées 2 586 Total charges financières 2 586 Résultat financier -2 586 Résultat Exceptionnel Total produits exceptionnels 68 000 Total charges exceptionnelles 26 854 Résultat exceptionnel 41 146" },
  { n: 36, text: "BI-PLANS Impôts sur les sociétés Résultat Courant -12 607 Résultat Exceptionnel 41 146 TOTAUX 28 539 Honoraires du Commissaire aux Comptes" },
  { n: 37, text: "BI-PLANS Effectif moyen Catégorie Cadres Agents de maîtrise Ouvriers TOTAL Engagements Financiers" },
  { n: 38, text: "BI-PLANS du 01/01/2024 au 31/12/2024" },
  { n: 39, text: "LIASSE FISCALE" },
  { n: 40, text: "Imprimés fiscaux" },
  { n: 41, text: "N°2065-SD 2025 IMPÔT SUR LES SOCIÉTÉS Formulaire obligatoire Exercice ouvert le 2024-01-01 et clos le 2024-12-31 BI-PLANS SIRET 41988144600035 ACORA PARIS ILE DE FRANCE" },
  { n: 42, text: "N° 2065 bis-SD 2025 IMPÔT SUR LES SOCIÉTÉS ANNEXE AU FORMULAIRE N°2065-SD Formulaire obligatoire RÉPARTITION DES PRODUITS DES ACTIONS ET PARTS SOCIALES" },
  { n: 43, text: "BILAN – ACTIF DGFiP N° 2050-SD 2025 Formulaire obligatoire N° 15949*03 BI-PLANS ACTIF IMMOBILISE Constructions 107 459 TOTAL (II) BJ 347 379 BK 220 734 126 645 Clients et comptes rattachés BX 327 329 BY 54 930 272 399 Disponibilités CF 15 482 CG TOTAL GÉNÉRAL CO 729 694 1A 275 664 454 030" },
  { n: 44, text: "BILAN – PASSIF avant répartition DGFiP N° 2051-SD 2025 Formulaire obligatoire BI-PLANS Capital social DA 7 622 Réserve légale DD 762 Autres réserves DG 200 745 RÉSULTAT DE L'EXERCICE DI 24 219 TOTAL (I) DL 233 349 Emprunts DU 58 806 Dettes fournisseurs DX 34 492 Dettes fiscales et sociales DY 112 962 Autres dettes EA 13 060 TOTAL (IV) EC 220 681 TOTAL GENERAL EE 454 030" },
  { n: 45, text: "COMPTE DE RÉSULTAT DE L'EXERCICE (en liste) DGFiP N° 2052-SD 2025 Formulaire obligatoire BI-PLANS Production vendue Services FG 752 298 Chiffres d'affaires nets FJ 752 298 FL 752 298 Reprises sur amortissements FP 4 257 Autres produits FQ 11 843 TOTAL DES PRODUITS D'EXPLOITATION FR 768 398 Achats FU 3 064 Autres achats et charges externes FW 266 574 Impôts FX 24 882 Salaires FY 282 989 Charges sociales FZ 121 483 dotations aux amortissements GA 29 356 Autres charges GE 50 072 TOTAL DES CHARGES D'EXPLOITATION GF 778 419 RÉSULTAT D'EXPLOITATION GG (10 021) Intérêts et charges assimilées GR 2 586 TOTAL DES CHARGES FINANCIÈRES GU 2 586" },
  { n: 46, text: "COMPTE DE RÉSULTAT DE L'EXERCICE (Suite) DGFiP N° 2053-SD 2025 Formulaire obligatoire BI-PLANS Produits exceptionnels HB 68 000 Total des produits exceptionnels HD 68 000 Charges exceptionnelles HE 260 HF 26 594 Total des charges exceptionnelles HH 26 854 RÉSULTAT EXCEPTIONNEL HI 41 146 Impôts sur les bénéfices HK 4 320 TOTAL DES PRODUITS HL 836 398 TOTAL DES CHARGES HM 812 179 BÉNÉFICE OU PERTE HN 24 219" },
  { n: 47, text: "2053-SD Détail des produits et charges exceptionnels VIR ORDRE ARCHITECTE/PONCET PENALITES 70 CARS CONSULTING 68 000 VENTE LAND ROVER FR-699-JV 26 554" },
  { n: 48, text: "DGFiP N° 2054-SD 2025 Formulaire obligatoire IMMOBILISATIONS BI-PLANS Autres postes d'immobilisations incorporelles KD 669 Constructions KJ 107 459 Installations techniques KS 6 665 Matériel de transport KY 110 941 Matériel de bureau LB 45 422 TOTAL III LN 321 601 Prêts et autres immobilisations financières 1T 48 117 TOTAL GÉNÉRAL 0G 370 386" },
  { n: 49, text: "DGFiP N° 2054 bis-SD 2025 Formulaire obligatoire TABLEAU DES ÉCARTS DE RÉÉVALUATION BI-PLANS" },
  { n: 50, text: "DGFiP N° 2055-SD 2025 Formulaire obligatoire AMORTISSEMENTS BI-PLANS Autres immobilisations incorporelles PE 669 Constructions PM 107 459 Installations techniques PZ 4 460 Autres immobilisations corporelles QD 43 083 QH 78 600 QL 35 762 TOTAL II QU 269 364 TOTAL GÉNÉRAL 0N 270 033" },
  { n: 51, text: "DGFiP N° 2056-SD 2025 PROVISIONS INSCRITES AU BILAN BI-PLANS Sur comptes clients 6T 54 930 TOTAL III 7B 54 930 TOTAL GENERAL 7C 54 930" },
  { n: 52, text: "DGFiP N° 2056-SD 2025 PROVISIONS INSCRITES AU BILAN Extensions" },
  { n: 53, text: "Calcul IS BI-PLANS Chiffre d'affaires 752 298 Base retenue 28 799 Impôt société taux réduit 28 799 15 4 320 IMPÔT SOCIÉTÉ À PAYER 4 320 RÉSULTAT NET COMPTABLE THÉORIQUE APRÈS IMPÔT 24 219 RÉSULTAT COMPTABLE RÉEL APRÈS IMPÔT 24 219" },
  { n: 54, text: "DGFiP N° 2057-SD 2025 ÉTAT DES ÉCHÉANCES DES CRÉANCES ET DES DETTES BI-PLANS Autres immobilisations financières UT 48 117 Clients douteux VA 65 916 Autres créances clients UX 261 413 TOTAUX VT 414 844 Emprunts VH 58 806 Fournisseurs 8B 34 492 Personnel 8C 19 118 Sécurité sociale 8D 20 521 TVA VW 70 485 Autres impôts VQ 2 838 Groupe et associés VI 1 362 Autres dettes 8K 13 060 TOTAUX VY 220 681" },
  { n: 55, text: "DGFiP N° 2058-A-SD DÉTERMINATION DU RÉSULTAT FISCAL BI-PLANS BÉNÉFICE COMPTABLE DE L'EXERCICE WA 24 219 Amendes et pénalités WJ 260 I7 4 320 TOTAL WR 28 799" },
  { n: 56, text: "DGFiP N° 2058-A-SD III. RESULTAT FISCAL BI-PLANS Bénéfice XI 28 799 RÉSULTAT FISCAL XN 28 799" },
  { n: 57, text: "DGFiP N° 2058-B-SD DÉFICITS INDEMNITÉS POUR CONGÉS À PAYER ET PROVISIONS NON DÉDUCTIBLES BI-PLANS ZT 3 702" },
  { n: 58, text: "DGFiP N° 2058-C-SD TABLEAU D'AFFECTATION DU RÉSULTAT ET RENSEIGNEMENTS DIVERS BI-PLANS Résultat de l'exercice 40 839 Sous-traitance YT 77 710 Locations J8 6 136 Autres comptes ST 156 545 ZJ 266 574 Taxe professionnelle YW 5 246 Autres impôts 9Z 19 636 YX 24 882 Montant de la TVA collectée YY 148 636" },
  { n: 59, text: "DGFiP N° 2059-A-SD DÉTERMINATION DES PLUS ET MOINS VALUES BI-PLANS LAND ROVER FR-699-JV 105 210 78 656 28 554 68 000 41 448 41 446" },
  { n: 60, text: "DGFiP N° 2059-B-SD SUIVI DES PLUS-VALUES À COURT TERME BI-PLANS" },
  { n: 61, text: "DGFiP N° 2059-C-SD SUIVI DES MOINS-VALUES À LONG TERME BI-PLANS" },
  { n: 62, text: "DGFiP N° 2059-D-SD RÉSERVE SPÉCIALE DES PLUS-VALUES À LONG TERME BI-PLANS" },
  { n: 63, text: "DGFiP N° 2059-E-SD DÉTERMINATION DES EFFECTIFS ET DE LA VALEUR AJOUTÉE BI-PLANS Ventes de produits 752 298 TOTAL 1 OX 752 298 Achats ON 110 276 Services extérieurs OR 146 176 Loyers OS 13 186 Autres charges OW 50 072 TOTAL 3 OJ 319 710 Valeur ajoutée OG 448 689" },
  { n: 64, text: "DGFiP N° 2059-F-SD COMPOSITION DU CAPITAL SOCIAL BI-PLANS Exercice clos le 2024-12-31 DUC SANDRINE 48,00 240 MASSON CYRIL 48,00 240" },
  { n: 65, text: "DGFiP N° 2059-G-SD FILIALES ET PARTICIPATIONS BI-PLANS NOMBRE TOTAL DE FILIALES 0" },
  { n: 66, text: "2069-RCI-SD RÉDUCTIONS ET CRÉDITS D'IMPÔT 2025 BI-PLANS" },
  { n: 67, text: "MECENAT Liste des bénéficiaires finaux" },
  { n: 68, text: "" },
  { n: 69, text: "PROCES VERBAL DE LA REUNION DE L'ASSEMBLEE GENERALE ORDINAIRE DU 30 SEPTEMBRE 2025 BI PLANS capital de 7 622,45 Euros 500 parts sociales M.MASSON Cyril 240 parts Melle DUC Sandrine 240 parts" },
  { n: 70, text: "Examen et renouvellement du mandat du gérant Commissaires aux comptes comptes annuels bilan compte de résultat annexe arrêtés au 31 décembre 2024" },
  { n: 71, text: "DEUXIEME RESOLUTION affectation du résultat Bénéfice 24219 Autres réserves 24219 DIVIDENDES ELIGIBLES" },
  { n: 72, text: "TROISIEME RESOLUTION conventions visées QUATRIEME RESOLUTION mandat de la gérance CINQUIEME RESOLUTION Commissaire aux comptes CLOTURE procès-verbal" },
  { n: 73, text: "Signatures M. MASSON Cyril Mlle DUC Sandrine Mme MASSON Louise-Marie Mme MASSON Donatienne" },
  { n: 74, text: "Bi-PLANS Architectes DPLG Greffe du Tribunal de commerce de Bobigny courrier dépôt des comptes" },
  { n: 75, text: "GREFFE DU TRIBUNAL DE COMMERCE DE BOBIGNY NOTIFICATION D'ORDONNANCE D'INJONCTION DE DEPOT DES COMPTES ANNUELS BI-PLANS exercice clos en 2024 CONVOCATION A L'AUDIENCE DU 13 mai 2026" },
  { n: 76, text: "OBSERVATIONS TRES IMPORTANTES Documents à produire pour le dépôt des comptes annuels Le bilan actif passif Le compte de résultat" }
];

console.log("=== Simulation classifyPage sur BI-PLANS (76 pages) ===\n");

let kept = 0;
let skipped = 0;
const keptPages = [];

for (const page of pages) {
  const result = classifyPage(page.text);
  const status = result.kept ? "✅ KEPT" : "❌ SKIP";
  const label = page.text.slice(0, 80);
  console.log(`Page ${String(page.n).padStart(2)}: ${status} | ${result.reason}`);
  console.log(`          "${label}..."`);
  if (result.kept) {
    kept++;
    keptPages.push(page.n);
  } else {
    skipped++;
  }
}

console.log(`\n=== RÉSULTAT ===`);
console.log(`Pages KEPT: ${kept} → [${keptPages.join(", ")}]`);
console.log(`Pages SKIPPED: ${skipped}`);
console.log(`isFullyScanned: false (texte extractible sur toutes les pages)`);
console.log(`imagelessMode: true (chemin standard, pas scan pur)`);
