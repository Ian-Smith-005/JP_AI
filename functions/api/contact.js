import { Resend } from "resend";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // parse request body
    const { name, email, phone, subject, message } = await request.json();

    // validation
    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Please fill in required fields",
        }),
        { status: 400 }
      );
    }

    // init resend
    const resend = new Resend(env.RESEND_API_KEY);

    // send email to YOU
    await resend.emails.send({
      from: "Joyalty <onboarding@resend.dev>",
      to: ["smithiian34@gmail.com"],
      subject: subject || "New Contact Message",
      reply_to: email,
      html: `
        <h2>New Contact Message</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || "N/A"}</p>
        <p><strong>Subject:</strong> ${subject || "N/A"}</p>
        <hr/>
        <p>${message}</p>
      `,
    });

    // auto-reply to client
    await resend.emails.send({
      from: "Joyalty <onboarding@resend.dev>",
      to: [email],
      subject: "We received your message 📸",
      html: `
        <p>Hello ${name},</p>
        <p>Thank you for contacting <strong>Joyalty Photography</strong>.</p>
        <p>We have received your message and will get back to you within 24 hours.</p>
        <br/>
        <p><strong>Your message:</strong></p>
        <p>${message}</p>
        <br/>
        <p>Best regards,<br/>Joyalty Photography</p>
      `,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    );

  } catch (error) {
    console.error("CONTACT ERROR:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to send message",
      }),
      { status: 500 }
    );
  }
}