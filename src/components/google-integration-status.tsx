"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, AlertCircle, ExternalLink, Settings, RefreshCw } from "lucide-react"

interface GoogleIntegrationStatusProps {
  isConnected: boolean
  accountName?: string
  locationName?: string
  lastSync?: string
  onReconnect?: () => void
  onDisconnect?: () => void
}

export function GoogleIntegrationStatus({
  isConnected,
  accountName,
  locationName,
  lastSync,
  onReconnect,
  onDisconnect
}: GoogleIntegrationStatusProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    // Add refresh logic here
    setTimeout(() => setIsRefreshing(false), 2000)
  }

  if (isConnected) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              <CardTitle>Google My Business Connected</CardTitle>
            </div>
            <Badge variant="default" className="bg-green-100 text-green-800">
              Active
            </Badge>
          </div>
          <CardDescription>
            Your property is connected and receiving real-time review notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Account:</span>
              <p className="font-medium">{accountName || 'Connected Account'}</p>
            </div>
            <div>
              <span className="text-gray-600">Location:</span>
              <p className="font-medium">{locationName || 'Connected Location'}</p>
            </div>
            <div>
              <span className="text-gray-600">Last Sync:</span>
              <p className="font-medium">{lastSync || 'Just now'}</p>
            </div>
            <div>
              <span className="text-gray-600">Status:</span>
              <p className="font-medium text-green-600">Monitoring Active</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            {onDisconnect && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={onDisconnect}
                className="text-red-600 hover:text-red-700"
              >
                Disconnect
              </Button>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium mb-3">Recent Activity</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>AI Response Generated</span>
                <span className="text-gray-500">2 hours ago</span>
              </div>
              <div className="flex items-center justify-between">
                <span>New Review Received</span>
                <span className="text-gray-500">1 day ago</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Account Synced</span>
                <span className="text-gray-500">3 days ago</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
            <CardTitle>Google My Business Not Connected</CardTitle>
          </div>
          <Badge variant="secondary">Inactive</Badge>
        </div>
        <CardDescription>
          Connect your Google My Business account to enable automatic review monitoring and AI responses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-yellow-50 rounded-lg p-4">
          <h4 className="font-medium mb-2 text-yellow-800">Manual Review Management</h4>
          <p className="text-sm text-yellow-700">
            Without Google integration, you'll need to manually check for new reviews and respond to them.
          </p>
        </div>

        <div className="flex gap-3">
          {onReconnect ? (
            <Button onClick={onReconnect} className="flex-1">
              <ExternalLink className="h-4 w-4 mr-2" />
              Connect Google Account
            </Button>
          ) : (
            <Button className="flex-1" asChild>
              <a href="/sign-up?step=3">
                <ExternalLink className="h-4 w-4 mr-2" />
                Connect Google Account
              </a>
            </Button>
          )}
        </div>

        <div className="text-sm text-gray-600">
          <p>• Real-time review notifications</p>
          <p>• Automatic AI-generated responses</p>
          <p>• Seamless review management</p>
          <p>• Direct integration with Google My Business</p>
        </div>
      </CardContent>
    </Card>
  )
}
