export const metadata = {
  title: "Privacy Policy — The Brief",
  description: "Privacy policy for The Brief.",
};

export default function PrivacyPage() {
  return (
    <article className="legal-page">
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: September 28, 2026</p>

      <p>
        This Privacy Policy describes how The Brief (&quot;we&quot;, &quot;us&quot;, or
        &quot;our&quot;) collects, uses, and shares information when you use our
        website and related services (the &quot;Service&quot;).
      </p>

      <h2>1. Information we collect</h2>
      <p>Depending on how you use the Service, we may collect:</p>
      <ul>
        <li>
          <strong>Account and access information</strong> — such as an access key
          or credentials you provide to use the Service.
        </li>
        <li>
          <strong>Email and newsletter content</strong> — if you connect a Gmail
          or similar account, we may access messages and metadata you authorize
          (for example newsletters) in order to sync, summarize, and deliver
          digests.
        </li>
        <li>
          <strong>Usage and technical data</strong> — such as IP address, browser
          type, device information, and pages or API routes requested, which may
          be collected automatically by our hosting provider (e.g. Vercel) for
          security and operation of the Service.
        </li>
        <li>
          <strong>Feed and source preferences</strong> — RSS or other sources you
          configure for briefing content.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <p>We use the information above to:</p>
      <ul>
        <li>Provide, operate, and improve the Service (including sync, summarization, and digests);</li>
        <li>Authenticate access and protect against abuse;</li>
        <li>Communicate with you about the Service when needed;</li>
        <li>Comply with law and enforce our terms.</li>
      </ul>
      <p>
        We do not sell your personal information. Content from connected email
        accounts is used only to provide the features you enable.
      </p>

      <h2>3. Sharing of information</h2>
      <p>We may share information with:</p>
      <ul>
        <li>
          <strong>Service providers</strong> — such as hosting, database, and AI
          model providers that process data on our behalf to run the Service;
        </li>
        <li>
          <strong>Legal requirements</strong> — when required by law, regulation,
          or valid legal process;
        </li>
        <li>
          <strong>Business transfers</strong> — in connection with a merger,
          acquisition, or sale of assets, subject to appropriate safeguards.
        </li>
      </ul>

      <h2>4. Data retention</h2>
      <p>
        We retain information for as long as needed to provide the Service and
        for legitimate business or legal purposes. You may request deletion of
        stored newsletter or briefing data by contacting us (see below).
        Disconnecting a connected email account stops further access under that
        connection; residual copies may remain until purged according to our
        retention practices.
      </p>

      <h2>5. Security</h2>
      <p>
        We take reasonable measures to protect information. No method of
        transmission or storage is completely secure, and we cannot guarantee
        absolute security.
      </p>

      <h2>6. Third-party services</h2>
      <p>
        The Service may rely on third parties (for example Google for Gmail
        OAuth, hosting providers, and AI APIs). Their use of information is
        governed by their own privacy policies. We encourage you to review those
        policies.
      </p>

      <h2>7. Children</h2>
      <p>
        The Service is not directed to children under 13 (or the applicable age
        in your jurisdiction). We do not knowingly collect personal information
        from children.
      </p>

      <h2>8. International users</h2>
      <p>
        If you access the Service from outside the United States, your
        information may be processed in the United States or other countries
        where our providers operate.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. The &quot;Last
        updated&quot; date at the top will change when we do. Continued use of
        the Service after changes means you accept the updated policy.
      </p>

      <h2>10. Contact</h2>
      <p>
        For privacy questions or requests, contact us at the email address
        associated with your Service account or deployment administrator.
      </p>

      <p className="legal-note">
        This is a general boilerplate policy and is not legal advice. Adapt it
        for your jurisdiction and product before relying on it in production.
      </p>
    </article>
  );
}
