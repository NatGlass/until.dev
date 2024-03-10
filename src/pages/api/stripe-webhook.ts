import { stripe } from "@/lib/stripe"
import { buffer } from "micro"
import { db, schema } from "@/db"
import Stripe from "stripe"
import { eq } from "drizzle-orm"
import { takeUniqueOrNull } from "@/db/utils"
import { NextApiRequest, NextApiResponse } from "next"

export const config = {
  api: {
    bodyParser: false,
  },
}

const stripeWebhookHandler = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" })
  }

  const payload = await buffer(req)
  let event: Stripe.Event

  const signature = req.headers["stripe-signature"]
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature as string,
      process.env.STRIPE_WEBHOOK_SECRET as string
    )
  } catch (err: any) {
    console.log(`⚠️  Webhook signature verification failed.`, err.message)
    return res
      .status(400)
      .json({ error: "Webhook signature verification failed" })
  }

  switch (event.type) {
    case "checkout.session.completed":
      const stripeSession = event.data.object as Stripe.Checkout.Session
      console.log(JSON.stringify(stripeSession, null, 2))

      await db
        .insert(schema.checkoutSession)
        .values({
          stripeCheckoutSessionId: stripeSession.id,
          status: stripeSession.status || "complete",
        })
        .onConflictDoUpdate({
          target: schema.checkoutSession.stripeCheckoutSessionId,
          set: {
            status: stripeSession.status || "complete",
          },
        })

      break
    default:
      // console.log(`🤷‍♀️ Unhandled event type ${event.type}`)
      break
  }

  return res.status(200).json({ ok: true })
}

export default stripeWebhookHandler
