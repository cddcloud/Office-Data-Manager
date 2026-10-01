declare global {
  namespace Express {
    interface Request {
      user: {
        id: string
        email: string
        name: string
        role: 'ADMIN' | 'VIEWER' | 'NORMAL_VIEWER' | 'VIP_VIEWER'
        clearance: 'V1' | 'V2' | 'V3' | 'V4' | null
        isPrimaryAdmin: boolean
        permissionVersion: number
        workflowReady?: boolean
        mustChangePassword: boolean
      }
    }
  }
}

export {}
