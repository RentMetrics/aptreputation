"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  Users, 
  Building, 
  CreditCard, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle,
  Smartphone,
  Settings,
  Search,
  Plus,
  Eye,
  Edit,
  RefreshCw,
  DollarSign,
  Calendar,
  Clock
} from "lucide-react"
import Link from "next/link"

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview")
  const [stripeData, setStripeData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  // Fetch Stripe data
  const fetchStripeData = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/stripe/admin-data')
      if (response.ok) {
        const data = await response.json()
        setStripeData(data)
        setLastUpdated(new Date())
      }
    } catch (error) {
      console.error('Error fetching Stripe data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStripeData()
  }, [])

  // Use Stripe data or fallback to mock data
  const stats = {
    totalCustomers: stripeData?.metrics?.totalCustomers || 24,
    totalProperties: 47, // This would come from Convex
    monthlyRevenue: stripeData?.metrics?.monthlyRevenue || 4568,
    activeSubscriptions: stripeData?.metrics?.activeSubscriptions || 42,
    pendingReviews: 156, // This would come from Convex
    avgReputationScore: 78 // This would come from Convex
  }

  const recentCustomers = [
    {
      id: 1,
      name: "Sarah Johnson",
      email: "sarah@sunsetapartments.com",
      properties: 2,
      status: "active",
      lastActive: "2 hours ago"
    },
    {
      id: 2,
      name: "Mike Chen",
      email: "mike@oakwoodproperties.com",
      properties: 1,
      status: "trial",
      lastActive: "1 day ago"
    },
    {
      id: 3,
      name: "Lisa Rodriguez",
      email: "lisa@vistaprop.com",
      properties: 3,
      status: "active",
      lastActive: "3 days ago"
    }
  ]

  const nfcCards = [
    {
      id: "NFC001",
      serialNumber: "04:C2:88:D2:5F:61:80",
      assignedTo: "Sunset Apartments - Front Desk",
      status: "active",
      lastUsed: "2 hours ago",
      totalTaps: 47
    },
    {
      id: "NFC002", 
      serialNumber: "04:C2:88:D2:5F:61:81",
      assignedTo: "Oakwood Properties - Lobby",
      status: "active",
      lastUsed: "1 day ago",
      totalTaps: 23
    },
    {
      id: "NFC003",
      serialNumber: "04:C2:88:D2:5F:61:82",
      assignedTo: "Vista Properties - Pool Area",
      status: "inactive",
      lastUsed: "Never",
      totalTaps: 0
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600">Manage your AptReputation business</p>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={fetchStripeData}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Link href="/admin/nfc-setup">
              <Button variant="outline">
                <Smartphone className="h-4 w-4 mr-2" />
                NFC Setup
              </Button>
            </Link>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 bg-white rounded-lg p-1 mb-8">
          {[
            { id: "overview", label: "Overview", icon: TrendingUp },
            { id: "customers", label: "Customers", icon: Users },
            { id: "properties", label: "Properties", icon: Building },
            { id: "payments", label: "Payments", icon: CreditCard },
            { id: "nfc", label: "NFC Cards", icon: Smartphone }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Last Updated */}
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
              {isLoading && (
                <div className="flex items-center text-sm text-blue-600">
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </div>
              )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalCustomers}</div>
                  <p className="text-xs text-muted-foreground">
                    +12% from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
                  <Building className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalProperties}</div>
                  <p className="text-xs text-muted-foreground">
                    +8% from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${stats.monthlyRevenue.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    {stripeData?.metrics?.totalRevenue ? 
                      `Total: $${stripeData.metrics.totalRevenue.toLocaleString()}` : 
                      '+23% from last month'
                    }
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.activeSubscriptions}</div>
                  <p className="text-xs text-muted-foreground">
                    {stripeData?.subscriptionBreakdown ? 
                      `${stripeData.subscriptionBreakdown.trialing} in trial` : 
                      '+15% from last month'
                    }
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Customers</CardTitle>
                  <CardDescription>Latest customer signups and activity</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(stripeData?.customers || recentCustomers).slice(0, 5).map((customer: any) => (
                      <div key={customer.id} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{customer.name || customer.email}</p>
                          <p className="text-sm text-gray-500">{customer.email}</p>
                          {customer.totalSpent && (
                            <p className="text-xs text-green-600">${customer.totalSpent} spent</p>
                          )}
                        </div>
                        <div className="text-right">
                          <Badge variant={customer.activeSubscriptions > 0 ? "default" : "secondary"}>
                            {customer.activeSubscriptions > 0 ? "Active" : "Inactive"}
                          </Badge>
                          <p className="text-xs text-gray-500 mt-1">
                            {customer.created ? new Date(customer.created).toLocaleDateString() : "Recently"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Payments</CardTitle>
                  <CardDescription>Latest successful payments and transactions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(stripeData?.recentPayments || []).slice(0, 5).map((payment: any) => (
                      <div key={payment.id} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">${payment.amount}</p>
                          <p className="text-sm text-gray-500">Payment {payment.id.slice(-8)}</p>
                          {payment.metadata?.propertyName && (
                            <p className="text-xs text-blue-600">{payment.metadata.propertyName}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <Badge variant="default">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Paid
                          </Badge>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(payment.created).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(!stripeData?.recentPayments || stripeData.recentPayments.length === 0) && (
                      <div className="text-center text-gray-500 py-4">
                        No recent payments
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Customers Tab */}
        {activeTab === "customers" && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Customers</CardTitle>
                  <CardDescription>Manage your customer accounts and properties</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Search customers..." className="w-64" />
                  <Button>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentCustomers.map((customer) => (
                  <div key={customer.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Users className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-sm text-gray-500">{customer.email}</p>
                        <p className="text-xs text-gray-400">{customer.properties} properties</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={customer.status === "active" ? "default" : "secondary"}>
                        {customer.status}
                      </Badge>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                      <Button variant="outline" size="sm">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* NFC Cards Tab */}
        {activeTab === "nfc" && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>NFC Review Cards</CardTitle>
                  <CardDescription>Manage and monitor NFC card usage</CardDescription>
                </div>
                <Link href="/admin/nfc-setup">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Setup New Card
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {nfcCards.map((card) => (
                  <div key={card.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Smartphone className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">{card.id}</p>
                        <p className="text-sm text-gray-500">{card.assignedTo}</p>
                        <p className="text-xs text-gray-400">SN: {card.serialNumber}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">{card.totalTaps} taps</p>
                        <p className="text-xs text-gray-500">Last: {card.lastUsed}</p>
                      </div>
                      <Badge variant={card.status === "active" ? "default" : "secondary"}>
                        {card.status}
                      </Badge>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Configure
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Properties Tab */}
        {activeTab === "properties" && (
          <Card>
            <CardHeader>
              <CardTitle>Properties</CardTitle>
              <CardDescription>Overview of all monitored properties</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">Property management interface will be implemented here</p>
            </CardContent>
          </Card>
        )}

        {/* Payments Tab */}
        {activeTab === "payments" && (
          <div className="space-y-6">
            {/* Payment Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${stripeData?.metrics?.totalRevenue?.toLocaleString() || '0'}
                  </div>
                  <p className="text-xs text-muted-foreground">All time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${stripeData?.metrics?.monthlyRevenue?.toLocaleString() || '0'}
                  </div>
                  <p className="text-xs text-muted-foreground">This month</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Revenue/Customer</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${stripeData?.metrics?.averageRevenuePerCustomer?.toLocaleString() || '0'}
                  </div>
                  <p className="text-xs text-muted-foreground">Per customer</p>
                </CardContent>
              </Card>
            </div>

            {/* Subscription Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Subscription Status</CardTitle>
                <CardDescription>Breakdown of subscription statuses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {stripeData?.subscriptionBreakdown ? (
                    <>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {stripeData.subscriptionBreakdown.active}
                        </div>
                        <div className="text-sm text-gray-600">Active</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          {stripeData.subscriptionBreakdown.trialing}
                        </div>
                        <div className="text-sm text-gray-600">Trial</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {stripeData.subscriptionBreakdown.canceled}
                        </div>
                        <div className="text-sm text-gray-600">Canceled</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">
                          {stripeData.subscriptionBreakdown.past_due}
                        </div>
                        <div className="text-sm text-gray-600">Past Due</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-600">
                          {stripeData.subscriptionBreakdown.unpaid}
                        </div>
                        <div className="text-sm text-gray-600">Unpaid</div>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-5 text-center text-gray-500 py-8">
                      No subscription data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Payments Table */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Payments</CardTitle>
                <CardDescription>Latest payment transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(stripeData?.recentPayments || []).map((payment: any) => (
                    <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium">${payment.amount}</p>
                          <p className="text-sm text-gray-500">Payment {payment.id.slice(-8)}</p>
                          {payment.metadata?.propertyName && (
                            <p className="text-xs text-blue-600">{payment.metadata.propertyName}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="default">Paid</Badge>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(payment.created).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {(!stripeData?.recentPayments || stripeData.recentPayments.length === 0) && (
                    <div className="text-center text-gray-500 py-8">
                      No recent payments
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
} 