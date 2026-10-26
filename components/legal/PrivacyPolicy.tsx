/**
 * ITJobCafe privacy policy — DRAFT, written from what the code actually
 * collects and shares (spec 2026-10-16). Not legal advice. ITJobCafe must
 * approve it before the mobile apps launch: replace the bracketed constants
 * below and set POLICY_IS_DRAFT to false (that removes the draft banner).
 * Profile storage updated for spec 2026-10-20 (server-side profile).
 */

import { LEGAL_H2, LEGAL_P, LEGAL_UL } from "@/components/legal/LegalPage";

export const POLICY_IS_DRAFT = true;
export const POLICY_LAST_UPDATED = "October 16, 2026";
export const CONTACT_EMAIL = "[contact email]";
const COMPANY_NAME = "[ITJobCafe legal entity name]";
const JURISDICTION = "[governing jurisdiction]";
const BACKUP_RETENTION = "[backup retention period]";

/** A mailto link once CONTACT_EMAIL is a real address; the placeholder until then. */
export function ContactEmail() {
  return CONTACT_EMAIL.includes("@") ? (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="font-medium text-accent hover:underline"
    >
      {CONTACT_EMAIL}
    </a>
  ) : (
    <span className="font-medium">{CONTACT_EMAIL}</span>
  );
}

export function PrivacyPolicy() {
  return (
    <article>
      {POLICY_IS_DRAFT && (
        <p
          role="note"
          className="mt-6 rounded-md border-2 border-[var(--caution)] bg-amber-50 p-4 text-sm font-medium"
        >
          Draft — pending ITJobCafe review. Bracketed items are placeholders.
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Last updated: {POLICY_LAST_UPDATED}
      </p>

      <p className={LEGAL_P}>
        {COMPANY_NAME} (“ITJobCafe”, “we”) runs the ITJobCafe website at
        itjobcafe.ai and the ITJobCafe mobile apps. This policy explains what
        we collect, why, who we share it with, and how to delete it.
      </p>

      <h2 className={LEGAL_H2}>What we collect</h2>
      <ul className={LEGAL_UL}>
        <li>
          <strong>Your account:</strong> your email address, your name if you
          give it, your password (stored only as a one-way hash — we never
          store or see the password itself), and when you last signed in. If
          you sign in with Google, we also store your Google account ID and a
          link to your Google profile picture.
        </li>
        <li>
          <strong>Resumes you upload:</strong> the file itself, the text we
          extract from it, and the name, phone number and job title you enter
          with it, if any.
        </li>
        <li>
          <strong>Your profile:</strong> what you enter on the Profile page —
          your name, phone number, LinkedIn, GitHub and portfolio links, school,
          major, graduation date, work authorization, and your job preferences
          (locations, roles, remote or on-site, target roles, technologies and
          job types) — along with the names of your uploaded resumes and whether
          to filter jobs by your preferences.
        </li>
        <li>
          <strong>Your job activity:</strong> the jobs you save, skip, apply to
          or otherwise track, your notes on them, and basic details of each job
          (title, company, location and link) as they were when you saved it.
        </li>
        <li>
          <strong>AI fit scores:</strong> the scores and explanations generated
          for your resume against jobs.
        </li>
        <li>
          <strong>Mobile app sign-ins:</strong> your device&apos;s name and when
          each app sign-in was created and last used.
        </li>
      </ul>
      <p className={LEGAL_P}>
        <strong>Your profile is stored with your account,</strong> so it is the
        same on the website and in the app. Your browser or the app also keeps a
        copy on your device. It is sent to the AI provider only when you ask for
        a job to be scored, and is used only to produce that score.
      </p>

      <h2 className={LEGAL_H2}>How we use it</h2>
      <ul className={LEGAL_UL}>
        <li>To show you job listings and filter them to your preferences.</li>
        <li>To keep track of the jobs you have saved, skipped or applied to.</li>
        <li>To score how well your resume fits a job, when you ask for it.</li>
        <li>To keep you signed in, and to answer you when you contact us.</li>
      </ul>
      <p className={LEGAL_P}>
        We do not sell your information, show ads, or use advertising or
        analytics trackers.
      </p>

      <h2 className={LEGAL_H2}>Who we share it with</h2>
      <ul className={LEGAL_UL}>
        <li>
          <strong>AI scoring providers — Anthropic and DeepSeek.</strong> When a
          job is scored, we send one of these providers your resume text
          (including any contact details written in your resume), the job
          description, and these profile details: your name, school, major,
          graduation date, work authorization, skills, job types, and target roles and
          locations. The provider returns the score and processes the data
          under its own terms.
        </li>
        <li>
          <strong>Our hosting provider,</strong> which runs the servers and
          database that store the information above.
        </li>
      </ul>
      <p className={LEGAL_P}>We may also disclose information if the law requires it.</p>

      <h2 className={LEGAL_H2}>Where job listings come from</h2>
      <p className={LEGAL_P}>
        Job listings are collected from publicly posted job advertisements.
        They are not information about you.
      </p>

      <h2 className={LEGAL_H2}>How long we keep it, and deleting it</h2>
      <p className={LEGAL_P}>
        We keep your information until you delete your account. You can delete
        it at any time from <strong>Settings → Delete account</strong>, on the
        website or in the app. Deleting your account immediately and
        permanently removes your account, your profile, your job activity and notes, your
        uploaded resumes, your AI fit scores and your app sign-ins. Copies in
        our database backups are removed within {BACKUP_RETENTION}.
      </p>
      <p className={LEGAL_P}>
        Deleting your account on the website also clears the copy of your
        profile stored in that browser. To clear a copy on another browser or
        device, clear that site&apos;s data or uninstall the app.
      </p>

      <h2 className={LEGAL_H2}>Security</h2>
      <p className={LEGAL_P}>
        The website and apps connect to us over HTTPS. Passwords are stored
        only as one-way hashes, and app sign-in tokens are stored only in
        hashed form.
      </p>

      <h2 className={LEGAL_H2}>Changes to this policy</h2>
      <p className={LEGAL_P}>
        If we change this policy, we will update this page and the “Last
        updated” date above.
      </p>

      <h2 className={LEGAL_H2}>Contact</h2>
      <p className={LEGAL_P}>
        Questions or requests about your information: <ContactEmail />. This
        policy is governed by the laws of {JURISDICTION}.
      </p>
    </article>
  );
}
