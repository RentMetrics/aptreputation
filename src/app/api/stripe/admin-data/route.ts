import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
})

export async function GET(request: NextRequest) {
  try {
    // Get current date and 30 days ago for metrics
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Fetch customers
    const customers = await stripe.customers.list({
      limit: 100,
      expand: ['data.subscriptions']
    })

    // Fetch subscriptions
    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      status: 'all'
    })

    // Fetch payment intents for revenue calculation
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 100,
      created: {
        gte: Math.floor(thirtyDaysAgo.getTime() / 1000)
      }
    })

    // Fetch invoices
    const invoices = await stripe.invoices.list({
      limit: 100,
      status: 'paid'
    })

    // Calculate metrics
    const totalCustomers = customers.data.length
    const activeSubscriptions = subscriptions.data.filter(sub => sub.status === 'active').length
    const trialSubscriptions = subscriptions.data.filter(sub => sub.status === 'trialing').length
    const canceledSubscriptions = subscriptions.data.filter(sub => sub.status === 'canceled').length

    // Calculate revenue
    const monthlyRevenue = subscriptions.data
      .filter(sub => sub.status === 'active')
      .reduce((total, sub) => {
        const amount = sub.items.data[0]?.price.unit_amount || 0
        return total + (amount / 100) // Convert from cents
      }, 0)

    const totalRevenue = invoices.data
      .filter(invoice => invoice.status === 'paid')
      .reduce((total, invoice) => {
        return total + (invoice.amount_paid / 100)
      }, 0)

    // Get recent payments
    const recentPayments = paymentIntents.data
      .filter(pi => pi.status === 'succeeded')
      .slice(0, 10)
      .map(pi => ({
        id: pi.id,
        amount: pi.amount / 100,
        status: pi.status,
        created: new Date(pi.created * 1000).toISOString(),
        customer: pi.customer,
        metadata: pi.metadata
      }))

    // Get subscription breakdown
    const subscriptionBreakdown = {
      active: activeSubscriptions,
      trialing: trialSubscriptions,
      canceled: canceledSubscriptions,
      past_due: subscriptions.data.filter(sub => sub.status === 'past_due').length,
      unpaid: subscriptions.data.filter(sub => sub.status === 'unpaid').length
    }

    // Get customer data with subscription info
    const customerData = customers.data.map(customer => {
      const customerSubscriptions = subscriptions.data.filter(
        sub => sub.customer === customer.id
      )
      
      return {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        created: new Date(customer.created * 1000).toISOString(),
        subscriptions: customerSubscriptions.length,
        activeSubscriptions: customerSubscriptions.filter(sub => sub.status === 'active').length,
        totalSpent: customerSubscriptions
          .filter(sub => sub.status === 'active')
          .reduce((total, sub) => {
            const amount = sub.items.data[0]?.price.unit_amount || 0
            return total + (amount / 100)
          }, 0)
      }
    })

    return NextResponse.json({
      metrics: {
        totalCustomers,
        activeSubscriptions,
        trialSubscriptions,
        canceledSubscriptions,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        averageRevenuePerCustomer: totalCustomers > 0 ? Math.round((totalRevenue / totalCustomers) * 100) / 100 : 0
      },
      subscriptionBreakdown,
      recentPayments,
      customers: customerData,
      subscriptions: subscriptions.data.map(sub => ({
        id: sub.id,
        customer: sub.customer,
        status: sub.status,
        currentPeriodStart: new Date(sub.current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        amount: sub.items.data[0]?.price.unit_amount ? sub.items.data[0].price.unit_amount / 100 : 0,
        currency: sub.currency,
        metadata: sub.metadata
      }))
    })
  } catch (error) {
    console.error('Error fetching Stripe admin data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Stripe data' },
      { status: 500 }
    )
  }
} 