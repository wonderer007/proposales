import { LoginForm } from "./login-form";

export const metadata = {
  title: "Enter code",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Proposales Plus</h1>
      <p className="text-muted-foreground mt-1.5 mb-6 text-sm">
        A demo build. Enter the code from the README to continue.
      </p>

      <LoginForm next={next ?? "/"} />
    </main>
  );
}
