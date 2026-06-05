import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

const ERRORS: Record<string, string> = {
  oauth_failed: "Google sign-in failed. Try again.",
  email_unverified: "Your Google email isn't verified.",
  not_allowed: "Your email isn't on the allowlist. Ask the admin to add you.",
};

export default function LoginPage() {
  const [params] = useSearchParams();
  const err = params.get("error");

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
        <h1 className="text-2xl font-semibold mb-2">annotool</h1>
        <p className="text-zinc-400 text-sm mb-6">
          Sign in to annotate comparison images and clock hours.
        </p>
        {err && (
          <div className="mb-4 text-sm rounded border border-red-800 bg-red-950/40 text-red-300 p-3">
            {ERRORS[err] || err}
          </div>
        )}
        <a
          href={api.loginUrl()}
          className="inline-block w-full px-4 py-3 rounded bg-white text-zinc-900 font-medium hover:bg-zinc-200"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
