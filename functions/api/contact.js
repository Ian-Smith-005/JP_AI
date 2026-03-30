import { Resend } from "resend";

export async function onRequestPost(context) {
  try {
    const resend = new Resend(context.env.RESEND_API_KEY);

    const body = await context.request.json();
    const { name, email, phone, subject, message } = body;

    if (!name || !email || !message) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing required fields"
      }), { status: 400 });
    }

    // send to you
    await resend.emails.send({
      from: "Joyalty <onboarding@resend.dev>",
      to: ["smithiian34@gmail.com"],
      subject: subject || "New Contact Message",
      reply_to: email,
      html: `
        <h2>New Contact Message</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone || "N/A"}</p>
        <p><b>Message:</b><br/>${message}</p>
      `
    });

    // auto reply
    await resend.emails.send({
      from: "Joyalty <onboarding@resend.dev>",
      to: [email],
      subject: "Message Received 📸",
      html: `
        <p>Hello ${name},</p>
        <p>We received your message. We'll reply within 24 hours.</p>
      `
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200
    });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: "Server error"
    }), { status: 500 });
  }
}