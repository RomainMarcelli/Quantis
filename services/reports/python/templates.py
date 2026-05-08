# File: services/reports/python/templates.py
# Role: génération déterministe des textes (résumé exécutif, constats) à
# partir des chiffres. Aucune génération LLM ici — UNIQUEMENT des règles
# template avec injection de variables. Toute formulation passe par ce
# module pour garantir reproductibilité et auditabilité.

from typing import Optional


def _money(v: Optional[float]) -> str:
    if v is None:
        return "N/D"
    sign = "-" if v < 0 else ""
    val = abs(int(round(v)))
    formatted = f"{val:,}".replace(",", " ")
    return f"{sign}{formatted} €"


def _pct(v: Optional[float], decimals: int = 2) -> str:
    if v is None:
        return "N/D"
    return f"{v:.{decimals}f} %".replace(".", ",")


def _ratio(v: Optional[float]) -> str:
    if v is None:
        return "N/D"
    return f"{v:.2f}x".replace(".", ",")


def _days(v: Optional[float]) -> str:
    if v is None:
        return "N/D"
    return f"{int(round(v))} jours"


def _sign(v: Optional[float]) -> str:
    if v is None:
        return "stable"
    return "positif" if v >= 0 else "négatif"


# ─── Résumé exécutif (page 3) ──────────────────────────────────────────────
def executive_summary(facts: dict) -> str:
    """Paragraphe templaté à partir des chiffres clés. Construit phrase par
    phrase, omet les phrases dont les chiffres sont None.

    facts attend : companyName, ca, resultat_net, ebe, tn (trésorerie nette),
    solvabilite_pct (déjà en % sur 100), threshold_solva_pct (vigilance, ex. 20)."""
    company = facts.get("companyName") or "L'entreprise"
    ca = facts.get("ca")
    rn = facts.get("resultat_net")
    ebe = facts.get("ebe")
    tn = facts.get("tn")
    solva_pct = facts.get("solvabilite_pct")
    threshold = facts.get("threshold_solva_pct", 20)

    sentences = []

    if ca is not None and rn is not None:
        if rn < 0:
            sentences.append(
                f"{company} affiche un chiffre d'affaires de {_money(ca)} sur la période "
                f"avec un résultat net déficitaire de {_money(rn)}."
            )
        else:
            sentences.append(
                f"{company} affiche un chiffre d'affaires de {_money(ca)} sur la période "
                f"avec un résultat net de {_money(rn)}."
            )

    if ebe is not None:
        if ebe < 0:
            sentences.append(
                f"L'excédent brut d'exploitation est négatif ({_money(ebe)}) traduisant "
                f"une structure de charges d'exploitation supérieure aux revenus."
            )
        else:
            sentences.append(
                f"L'excédent brut d'exploitation s'établit à {_money(ebe)}, "
                f"signe d'une exploitation opérationnellement rentable."
            )

    if tn is not None:
        if tn >= 0:
            sentences.append(
                f"La trésorerie nette reste positive à {_money(tn)} ce qui préserve "
                f"la liquidité à court terme."
            )
        else:
            sentences.append(
                f"La trésorerie nette est négative à {_money(tn)} — un besoin de "
                f"financement court terme s'impose."
            )

    if solva_pct is not None:
        if solva_pct < threshold:
            sentences.append(
                f"Le ratio de solvabilité à {_pct(solva_pct)} (seuil de vigilance : "
                f"{threshold} %) indique une couverture très faible des engagements "
                f"par les capitaux propres."
            )
        else:
            sentences.append(
                f"Le ratio de solvabilité à {_pct(solva_pct)} reste supérieur au seuil "
                f"de vigilance de {threshold} %."
            )

    return " ".join(sentences) if sentences else "Données financières insuffisantes pour produire une synthèse."


# ─── Constats (page 3, 7, 8) ──────────────────────────────────────────────
def synthese_constats(facts: dict) -> list:
    """Liste de constats { message, severity } pour la page synthèse."""
    out: list = []
    rn = facts.get("resultat_net")
    ca = facts.get("ca")
    solva_pct = facts.get("solvabilite_pct")
    cp = facts.get("total_cp")
    dettes = facts.get("total_dettes")
    tn = facts.get("tn")
    liq_gen = facts.get("liq_gen")

    if rn is not None and rn < 0:
        ratio_loss = (abs(rn) / ca * 100) if ca and ca > 0 else None
        if ratio_loss is not None:
            out.append({
                "severity": "risk",
                "message": f"Résultat net négatif. La perte de {_money(rn)} représente "
                           f"{ratio_loss:.1f} % du CA.".replace(".", ","),
            })
        else:
            out.append({
                "severity": "risk",
                "message": f"Résultat net négatif ({_money(rn)}).",
            })
    elif rn is not None and rn >= 0:
        out.append({
            "severity": "positive",
            "message": f"Résultat net positif ({_money(rn)}).",
        })

    if solva_pct is not None and solva_pct < 20:
        cp_label = _money(cp)
        dettes_label = _money(dettes)
        out.append({
            "severity": "warning",
            "message": f"Solvabilité à {_pct(solva_pct)} — seuil de vigilance à 20 %. "
                       f"Capitaux propres de {cp_label} pour {dettes_label} de dettes.",
        })

    if tn is not None and tn >= 0 and liq_gen is not None and liq_gen >= 1:
        out.append({
            "severity": "positive",
            "message": f"Trésorerie nette positive à {_money(tn)}. "
                       f"Liquidité générale à {_ratio(liq_gen)} — dettes CT couvertes.",
        })
    elif tn is not None and tn < 0:
        out.append({
            "severity": "risk",
            "message": f"Trésorerie nette négative à {_money(tn)} — besoin de financement court terme.",
        })

    return out


def value_creation_constats(facts: dict) -> list:
    """Constats pour la page 7 (création de valeur + investissement)."""
    out: list = []
    tmscv_pct = facts.get("tmscv_pct")
    ebe = facts.get("ebe")
    salaires = facts.get("salaires")
    charges_soc = facts.get("charges_soc")
    ca = facts.get("ca")
    dso = facts.get("dso")
    bfr = facts.get("bfr")

    if tmscv_pct is not None and tmscv_pct >= 80:
        out.append({
            "severity": "info",
            "message": f"TMSCV à {_pct(tmscv_pct, 0)} — charges variables quasi inexistantes. "
                       f"L'essentiel des charges est fixe (masse salariale).",
        })

    if ebe is not None and ebe < 0 and salaires is not None and ca is not None:
        masse = (salaires or 0) + (charges_soc or 0)
        if masse > ca and ca > 0:
            ratio = (masse - ca) / ca * 100
            out.append({
                "severity": "risk",
                "message": f"EBE négatif : la masse salariale de {_money(masse)} dépasse le "
                           f"CA de {ratio:.0f} %. Structure non viable sans croissance du revenu.".replace(".", ","),
            })

    if dso is not None and dso > 60:
        out.append({
            "severity": "warning",
            "message": f"DSO à {_days(dso)} — délai d'encaissement très supérieur à la "
                       f"norme PME (30-45 jours). Risque de trésorerie.",
        })

    if bfr is not None and bfr < 0:
        out.append({
            "severity": "positive",
            "message": f"BFR négatif ({_money(bfr)}) — situation favorable, les "
                       f"fournisseurs financent le cycle d'exploitation.",
        })

    return out


def financing_constats(facts: dict) -> list:
    """Constats pour la page 8 (financement + rentabilité)."""
    out: list = []
    caf = facts.get("caf")
    solva_pct = facts.get("solvabilite_pct")
    cp = facts.get("total_cp")
    total_actif = facts.get("total_actif")
    liq_gen = facts.get("liq_gen")
    liq_red = facts.get("liq_red")
    liq_imm = facts.get("liq_imm")
    tresorerie = facts.get("tresorerie_dispo")
    burn_monthly = facts.get("burn_mensuel")

    if caf is not None and caf < 0:
        out.append({
            "severity": "risk",
            "message": f"CAF négative ({_money(caf)}) — l'activité ne génère pas de trésorerie par elle-même.",
        })
    elif caf is not None:
        out.append({
            "severity": "positive",
            "message": f"CAF positive ({_money(caf)}) — l'activité génère des liquidités.",
        })

    if solva_pct is not None and solva_pct < 20:
        out.append({
            "severity": "warning",
            "message": f"Solvabilité à {_pct(solva_pct)} (seuil : 20 %). Capitaux propres "
                       f"de {_money(cp)} pour un total bilan de {_money(total_actif)}.",
        })

    liquidities = [liq_gen, liq_red, liq_imm]
    if all(l is not None and l >= 1 for l in liquidities[:2]):
        out.append({
            "severity": "positive",
            "message": "Liquidité préservée — les 3 ratios de liquidité sont au-dessus des seuils grâce à la trésorerie.",
        })

    if tresorerie is not None and burn_monthly is not None and burn_monthly < 0:
        runway = tresorerie / abs(burn_monthly)
        if runway > 0:
            out.append({
                "severity": "info",
                "message": f"Runway estimé à ~{int(round(runway))} mois au rythme actuel "
                           f"(trésorerie {int(round(tresorerie/1000))} K€ / burn mensuel "
                           f"~{int(round(abs(burn_monthly)/1000))} K€). Hypothèse à valider.",
            })

    return out


# ─── Verdict score (page 3) ───────────────────────────────────────────────
def score_verdict(score: Optional[float], company: str, label: str) -> str:
    """Phrase template du verdict."""
    if score is None:
        return f"Vyzor n'a pas pu évaluer la santé financière de {company} sur cette période — données insuffisantes."
    return (f"Vyzor évalue la santé financière de {company} à {int(round(score))}/100 — "
            f"situation qualifiée de {label}.")


def score_variation_text(current: Optional[float], previous: Optional[float]) -> dict:
    """{text, severity} décrivant la variation N vs N-1."""
    if current is None or previous is None:
        return {"text": "Premier exercice analysé — pas de comparaison disponible.",
                "severity": "neutral"}
    diff = current - previous
    if abs(diff) < 0.5:
        return {"text": "Score stable par rapport à l'exercice précédent.", "severity": "neutral"}
    if diff > 0:
        return {"text": f"+{int(round(diff))} points par rapport à l'exercice précédent.",
                "severity": "positive"}
    return {"text": f"{int(round(diff))} points par rapport à l'exercice précédent.",
            "severity": "risk"}
