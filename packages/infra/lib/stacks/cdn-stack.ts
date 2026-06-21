// Requirements: 8.4, 8.5, 11.4, 7.1, 7.5

import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';

export interface CdnStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
}

/**
 * CDN stack provisioning CloudFront, S3, and ACM certificate for the
 * Solo Founder Launch OS frontend static assets.
 *
 * - S3 bucket for static assets (block all public access, OAI for CloudFront)
 * - CloudFront Origin Access Identity (OAI) for secure S3 access
 * - ACM certificate in us-east-1 for the web domain (DNS validation)
 * - CloudFront distribution with:
 *   - S3 origin via OAI
 *   - HTTPS only viewer protocol policy
 *   - Gzip + Brotli compression enabled
 *   - Custom error responses: 403/404 → /index.html (SPA routing)
 *   - Default root object: index.html
 *   - PriceClass.PRICE_CLASS_100 for cost efficiency
 */
export class CdnStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    const { config } = props;

    // --- S3 Bucket for Static Assets ---
    this.bucket = new s3.Bucket(this, 'StaticAssetsBucket', {
      bucketName: `solo-founder-${config.stage}-static-assets`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy:
        config.stage === 'production'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: config.stage !== 'production',
    });

    // --- Origin Access Identity ---
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'OriginAccessIdentity',
      {
        comment: `OAI for solo-founder-${config.stage} static assets`,
      },
    );

    // Grant CloudFront OAI read access to the bucket
    this.bucket.grantRead(originAccessIdentity);

    // --- ACM Certificate (must be in us-east-1 for CloudFront) ---
    this.certificate = new acm.Certificate(this, 'WebCertificate', {
      domainName: config.domain.web,
      validation: acm.CertificateValidation.fromDns(),
    });

    // --- CloudFront Distribution ---
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Solo Founder ${config.stage} - Web CDN`,
      defaultRootObject: 'index.html',
      domainNames: [config.domain.web],
      certificate: this.certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      enabled: true,
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // --- Stack Outputs ---
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name for static assets',
      exportName: `${config.stage}-StaticAssetsBucketName`,
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: `${config.stage}-CloudFrontDistributionId`,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: `${config.stage}-CloudFrontDomainName`,
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'ACM certificate ARN for web domain',
      exportName: `${config.stage}-WebCertificateArn`,
    });
  }
}
