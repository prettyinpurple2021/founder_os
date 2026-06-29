// Requirements: 11.10, 11.11

export interface EnvironmentConfig {
  readonly account: string;
  readonly region: string;
  readonly stage: 'staging' | 'production';
  readonly domain: {
    readonly api: string;
    readonly web: string;
    readonly zone: string;
  };
  readonly database: {
    readonly instanceClass: string;
    readonly allocatedStorage: number;
    readonly multiAz: boolean;
  };
  readonly ecs: {
    readonly cpu: number;
    readonly memory: number;
    readonly minCapacity: number;
    readonly maxCapacity: number;
    readonly scaleOutCpuPercent: number;
    readonly scaleInCpuPercent: number;
  };
  readonly monitoring: {
    readonly alarmEmail: string;
    readonly logRetentionDays: number;
  };
}

export const environments: Record<'staging' | 'production', EnvironmentConfig> = {
  staging: {
    account: '069091211516',
    region: 'us-east-1',
    stage: 'staging',
    domain: {
      api: 'api.solo-founder.space',
      web: 'app.solo-founder.space',
      zone: 'solo-founder.space',
    },
    database: {
      instanceClass: 't3.micro',
      allocatedStorage: 20,
      multiAz: false,
    },
    ecs: {
      cpu: 256,
      memory: 512,
      minCapacity: 1,
      maxCapacity: 2,
      scaleOutCpuPercent: 70,
      scaleInCpuPercent: 30,
    },
    monitoring: {
      alarmEmail: 'founder@solosuccesss.com', // Replace with your email
      logRetentionDays: 30,
    },
  },
  production: {
    account: '069091211516',
    region: 'us-east-1',
    stage: 'production',
    domain: {
      api: 'api.solo-founder.space',
      web: 'solo-founder.space',
      zone: 'solo-founder.space',
    },
    database: {
      instanceClass: 't3.micro',
      allocatedStorage: 20,
      multiAz: true,
    },
    ecs: {
      cpu: 512,
      memory: 1024,
      minCapacity: 1,
      maxCapacity: 4,
      scaleOutCpuPercent: 70,
      scaleInCpuPercent: 30,
    },
    monitoring: {
      alarmEmail: 'founder@solosuccesss.com', // Replace with your email
      logRetentionDays: 90,
    },
  },
};
