import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const auditData = await request.json()
    
    // For now, just log to console since Convex is having issues
    console.log('Audit logged:', auditData)
    
    // In the future, this would save to Convex or another database
    return NextResponse.json({ 
      success: true, 
      message: 'Audit logged successfully' 
    })
  } catch (error) {
    console.error('Error logging audit:', error)
    return NextResponse.json(
      { error: 'Failed to log audit' },
      { status: 500 }
    )
  }
} 