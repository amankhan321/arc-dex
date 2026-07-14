"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export function Prose({
  title,
  updated,
  lede,
  children,
}: {
  title: string;
  updated?: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20 pt-12">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs text-muted transition-colors duration-300 ease-ease hover:text-fg"
      >
        <ArrowLeft size={13} />
        Back to the exchange
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8"
      >
        <h1 className="text-3xl font-medium tracking-[-0.02em] text-fg">
          {title}
        </h1>
        {updated && (
          <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-faint">
            Last updated {updated}
          </p>
        )}
        {lede && (
          <p className="mt-5 text-sm leading-relaxed text-muted">{lede}</p>
        )}

        <div className="mt-10 space-y-10">{children}</div>
      </motion.div>
    </main>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass lift p-6"
    >
      <h2 className="text-sm font-medium text-fg">{heading}</h2>
      <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-muted">
        {children}
      </div>
    </motion.section>
  );
}
