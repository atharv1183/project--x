import { useEffect, useState, type ElementType, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  Building2, ArrowLeft, Sparkles, User, Mail, Phone, Briefcase,
  MessageSquare, CheckCircle2, Send, Shield, Rocket, Calendar,
} from "lucide-react";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().min(7, "Invalid phone").max(20),
  company: z.string().trim().max(120).optional(),
  role: z.string().trim().max(80).optional(),
  message: z.string().trim().max(1000).optional(),
});

const perks = [
  { icon: Calendar, title: "30-min walkthrough", desc: "Tailored to your business." },
  { icon: Rocket, title: "Custom setup plan", desc: "From day one to scale." },
  { icon: Shield, title: "No commitment", desc: "Explore at your own pace." },
];

const BookDemo = () => {
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.scrollTo(0, 0);
    return () => {
      cancelAnimationFrame(t);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        next[i.path[0] as string] = i.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const payload = {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        company: parsed.data.company || "",
        role: parsed.data.role || "",
        message: parsed.data.message || "",
        status: "new",
        source: "book-demo",
        submittedAt: serverTimestamp(),
        pagePath: window.location.pathname.slice(0, 80),
      };
      await addDoc(collection(db, "demoRequests"), {
        ...payload,
      });
      setDone(true);
      toast({ title: "Request received", description: "We'll reach out within 24 hours." });
    } catch (error) {
      console.error("Demo request submit failed", error);
      const mailSubject = encodeURIComponent("Book a demo request - EstatePlus");
      const mailBody = encodeURIComponent(
        [
          `Name: ${parsed.data.name}`,
          `Email: ${parsed.data.email}`,
          `Phone: ${parsed.data.phone}`,
          `Company: ${parsed.data.company || "-"}`,
          `Role: ${parsed.data.role || "-"}`,
          "",
          parsed.data.message || "",
        ].join("\n")
      );
      toast({
        title: "Could not submit request",
        description: "Opening email instead so your request is not lost.",
      });
      window.location.href = `mailto:growth@estatepluscrm.in?subject=${mailSubject}&body=${mailBody}`;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`h-screen overflow-y-auto overflow-x-hidden bg-gradient-soft text-foreground transition-all duration-700 ${
        mounted ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-6 blur-sm"
      }`}
    >
      <div className="fixed inset-0 -z-10 bg-grid opacity-50" />
      <div className="fixed -top-24 -right-24 -z-10 h-[28rem] w-[28rem] rounded-full bg-primary/20 blur-3xl animate-float" />
      <div
        className="fixed -bottom-24 -left-24 -z-10 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-3xl animate-float"
        style={{ animationDelay: "2s" }}
      />

      <header className="sticky top-0 z-50 glass">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center transition-transform duration-300 hover:-translate-y-0.5">
            <img
              src="/logo.jpg"
              alt="Estate Plus"
              className="h-14 w-auto rounded-lg object-contain brightness-125 contrast-125 saturate-150 drop-shadow-[0_10px_18px_rgba(16,185,129,0.18)]"
            />
          </a>
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </a>
        </nav>
      </header>

      <main className="relative mx-auto grid max-w-7xl items-start gap-12 px-6 py-16 md:py-24 lg:grid-cols-5">
        <div className="space-y-8 lg:col-span-2">
          <div className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" /> Book your free demo
          </div>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            See <span className="gradient-text">EstatePlus</span> in action
          </h1>
          <p className="text-lg text-muted-foreground">
            Tell us a little about your business and we'll set up a personalized walkthrough - no pressure, no commitment.
          </p>
          <div className="space-y-4">
            {perks.map((p) => (
              <div key={p.title} className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-elegant">
                  <p.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-sm text-muted-foreground">{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          <Card className="relative overflow-hidden border-2 bg-card/80 p-8 shadow-elegant backdrop-blur-xl md:p-10">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-primary opacity-10 blur-2xl" />

            {done ? (
              <div className="relative py-10 text-center">
                <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow animate-pulse-glow">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h2 className="mb-3 text-3xl font-bold">You're all set!</h2>
                <p className="mx-auto mb-8 max-w-md text-muted-foreground">
                  Thanks for reaching out. Our team will contact you within 24 hours to schedule your demo.
                </p>
                <a href="/">
                  <Button size="lg" className="bg-gradient-primary shadow-elegant hover:opacity-90">
                    Back to home
                  </Button>
                </a>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="relative space-y-5">
                <Field label="Full name" icon={User} name="name" placeholder="Jane Doe" error={errors.name} />
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Email"
                    icon={Mail}
                    name="email"
                    type="email"
                    placeholder="jane@company.com"
                    error={errors.email}
                  />
                  <Field
                    label="Phone"
                    icon={Phone}
                    name="phone"
                    type="tel"
                    placeholder="+91 90000 00000"
                    error={errors.phone}
                  />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Company"
                    icon={Building2}
                    name="company"
                    placeholder="Acme Realty"
                    error={errors.company}
                  />
                  <Field
                    label="Role"
                    icon={Briefcase}
                    name="role"
                    placeholder="Founder / Sales Head"
                    error={errors.role}
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <MessageSquare className="h-4 w-4 text-primary" /> How can we help?
                  </label>
                  <Textarea
                    name="message"
                    placeholder="Tell us about your team size, current tools, and what you'd like to improve..."
                    rows={4}
                    className="resize-none"
                  />
                  {errors.message && <p className="text-xs text-destructive">{errors.message}</p>}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting}
                  className="h-12 w-full bg-gradient-primary text-base font-semibold shadow-elegant hover:opacity-90"
                >
                  {submitting ? "Sending..." : <>Book my free demo <Send className="ml-1" /></>}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  By submitting, you agree to be contacted about EstatePlus. We respect your inbox.
                </p>
              </form>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
};

const Field = ({
  label,
  icon: Icon,
  name,
  type = "text",
  placeholder,
  error,
}: {
  label: string;
  icon: ElementType;
  name: string;
  type?: string;
  placeholder?: string;
  error?: string;
}) => (
  <div className="space-y-2">
    <label className="flex items-center gap-2 text-sm font-medium">
      <Icon className="h-4 w-4 text-primary" /> {label}
    </label>
    <Input name={name} type={type} placeholder={placeholder} className="h-11" />
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
);

export default BookDemo;
