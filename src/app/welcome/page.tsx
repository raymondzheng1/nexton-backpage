/**
 * The shareable front page. Always the paper, even for a coach who already has teams (the Back Page
 * itself swaps its masthead link to "Open the app →" for them) — a link someone forwards must land
 * on the pitch, not inside a stranger's app.
 */
import { BackPage } from "@/features/marketing/BackPage";

export default function WelcomePage() {
  return <BackPage />;
}
