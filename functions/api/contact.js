import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { name, email, phone, subject, message } = req.body;

    // validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    // send email to YOU
    await resend.emails.send({
      from: "Joyalty <onboarding@resend.dev>",
      to: ["joyaltyphotography254@gmail.com"],
      subject: subject || "New Contact Message",
      reply_to: email,
      html: `
        <h2>New Contact Message</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || "N/A"}</p>
        <p><strong>Subject:</strong> ${subject || "N/A"}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    });

    // auto-reply to client
    await resend.emails.send({
      from: "Joyalty <onboarding@resend.dev>",
      to: [email],
      subject: "We received your message 📸",
      html: `
        <h3>Hello ${name},</h3>
        <p>Thank you for contacting <strong>Joyalty Photography</strong>.</p>
        <p>We have received your message and will get back to you within 24 hours.</p>
        <br/>
        <p><strong>Your Message:</strong></p>
        <p>${message}</p>
        <br/>
        <p>Best regards,<br/>Joyalty Photography</p>
      `,
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("CONTACT ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to send message",
    });
  }
}