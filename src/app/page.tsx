"use client";
/**
 * The front page.
 *
 * A visitor with no teams gets the Back Page (the marketing splash); a returning coach gets their
 * teams. Unlike the original app, the marketing page is NOT gated behind `ready`: waiting for the
 * local database meant a first-time visitor's first painted frame was app furniture and the word
 * "Loading…". A stranger should never see the inside of an app they haven't started using, so while
 * we don't yet know, we show the paper — which is also the correct answer for everyone arriving
 * from a shared link.
 */
import { useAppStore } from "@/store/appStore";
import { BackPage } from "@/features/marketing/BackPage";
import { TeamsIndex } from "@/features/teams/TeamsIndex";

export default function HomePage() {
  const ready = useAppStore((s) => s.ready);
  const teams = useAppStore((s) => s.teams);

  if (!ready || teams.length === 0) return <BackPage />;
  return <TeamsIndex />;
}
