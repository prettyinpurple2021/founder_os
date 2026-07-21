import passport from 'passport';
import { Strategy as GitHubStrategy, Profile } from 'passport-github2';
import prisma from '../lib/prisma.js';
import { encrypt } from '../lib/encryption.js';

/**
 * Initializes the GitHub OAuth strategy. Must be called after config is loaded
 * (either from env vars or Secrets Manager).
 */
export function initializePassport(config?: { clientId: string; clientSecret: string; callbackUrl: string }): void {
  const GITHUB_CLIENT_ID = config?.clientId ?? process.env.GITHUB_CLIENT_ID!;
  const GITHUB_CLIENT_SECRET = config?.clientSecret ?? process.env.GITHUB_CLIENT_SECRET!;
  const GITHUB_CALLBACK_URL = config?.callbackUrl ?? process.env.GITHUB_CALLBACK_URL!;

  if (!GITHUB_CLIENT_ID) {
    console.error('[passport] GITHUB_CLIENT_ID not set — skipping OAuth strategy initialization');
    return;
  }

  passport.use(
    new GitHubStrategy(
      {
        clientID: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        callbackURL: GITHUB_CALLBACK_URL,
      },
      async (
        accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: (err: Error | null, user?: Express.User) => void,
      ) => {
        try {
          const email =
            profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;

          const user = await prisma.user.upsert({
            where: { githubId: profile.id },
            update: {
              username: profile.username ?? profile.displayName,
              email,
              accessToken: encrypt(accessToken),
            },
            create: {
              githubId: profile.id,
              username: profile.username ?? profile.displayName,
              email,
              accessToken: encrypt(accessToken),
            },
          });

          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      },
    ),
  );
}

// Serialize user by ID into the session
passport.serializeUser((user: Express.User, done) => {
  done(null, (user as { id: string }).id);
});

// Deserialize user from the session by looking up by ID
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

export default passport;
