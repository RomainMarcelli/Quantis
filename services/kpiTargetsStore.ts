// File: services/kpiTargetsStore.ts
// Role: CRUD Firestore client pour les alertes et objectifs KPI de
// l'utilisateur. Stockage : `users/{uid}/kpiAlerts/{id}` et
// `users/{uid}/kpiObjectives/{id}`. Les ids sont générés client-side
// via crypto.randomUUID() pour pouvoir réagir avant le round-trip.

"use client";

import {
  collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc,
} from "firebase/firestore";
import { firestoreDb } from "@/lib/firebase";
import type {
  KpiAlert, KpiObjective, KpiAlertCondition, KpiObjectiveDirection,
} from "@/types/kpiTargets";

function alertsCollection(userId: string) {
  return collection(firestoreDb, "users", userId, "kpiAlerts");
}

function objectivesCollection(userId: string) {
  return collection(firestoreDb, "users", userId, "kpiObjectives");
}

function alertDoc(userId: string, id: string) {
  return doc(firestoreDb, "users", userId, "kpiAlerts", id);
}

function objectiveDoc(userId: string, id: string) {
  return doc(firestoreDb, "users", userId, "kpiObjectives", id);
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

// ─── Alerts ────────────────────────────────────────────────────────────

export async function listAlerts(userId: string): Promise<KpiAlert[]> {
  const snap = await getDocs(alertsCollection(userId));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      kpiId: data.kpiId,
      condition: data.condition as KpiAlertCondition,
      threshold: typeof data.threshold === "number" ? data.threshold : 0,
      label: typeof data.label === "string" ? data.label : undefined,
      enabled: data.enabled !== false,
      lastTriggeredAt: data.lastTriggeredAt?.toDate?.()?.toISOString?.() ?? data.lastTriggeredAt,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt,
    };
  });
}

export async function saveAlert(userId: string, alert: Omit<KpiAlert, "id"> & { id?: string }): Promise<KpiAlert> {
  const id = alert.id ?? newId();
  const data: Record<string, unknown> = {
    kpiId: alert.kpiId,
    condition: alert.condition,
    threshold: alert.threshold,
    enabled: alert.enabled,
  };
  if (alert.label) data.label = alert.label;
  if (alert.lastTriggeredAt) data.lastTriggeredAt = alert.lastTriggeredAt;
  if (!alert.id) data.createdAt = serverTimestamp();
  await setDoc(alertDoc(userId, id), data, { merge: true });
  return { ...alert, id };
}

export async function deleteAlert(userId: string, id: string): Promise<void> {
  await deleteDoc(alertDoc(userId, id));
}

// ─── Objectives ────────────────────────────────────────────────────────

export async function listObjectives(userId: string): Promise<KpiObjective[]> {
  const snap = await getDocs(objectivesCollection(userId));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      kpiId: data.kpiId,
      target: typeof data.target === "number" ? data.target : 0,
      direction: (data.direction as KpiObjectiveDirection) ?? "max",
      label: typeof data.label === "string" ? data.label : undefined,
      deadline: typeof data.deadline === "string" ? data.deadline : undefined,
      enabled: data.enabled !== false,
      lastReachedAt: data.lastReachedAt?.toDate?.()?.toISOString?.() ?? data.lastReachedAt,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt,
      baselineValue: typeof data.baselineValue === "number" ? data.baselineValue : undefined,
    };
  });
}

export async function saveObjective(userId: string, objective: Omit<KpiObjective, "id"> & { id?: string }): Promise<KpiObjective> {
  const id = objective.id ?? newId();
  const data: Record<string, unknown> = {
    kpiId: objective.kpiId,
    target: objective.target,
    direction: objective.direction,
    enabled: objective.enabled,
  };
  if (objective.label) data.label = objective.label;
  if (objective.deadline) data.deadline = objective.deadline;
  if (objective.lastReachedAt) data.lastReachedAt = objective.lastReachedAt;
  // baselineValue : on ne persiste qu'à la création (id absent) — c'est un
  // point d'ancrage figé. Sur les saves d'update (ex. notification fired),
  // on n'écrase pas la baseline existante.
  if (!objective.id && typeof objective.baselineValue === "number" && Number.isFinite(objective.baselineValue)) {
    data.baselineValue = objective.baselineValue;
  }
  if (!objective.id) data.createdAt = serverTimestamp();
  await setDoc(objectiveDoc(userId, id), data, { merge: true });
  return { ...objective, id };
}

export async function deleteObjective(userId: string, id: string): Promise<void> {
  await deleteDoc(objectiveDoc(userId, id));
}
