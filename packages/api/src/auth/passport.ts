import passport from 'passport';
import { Strategy as GitHubStrategy, Profile } from 'passport-github2';
import prisma from '../lib/prisma.js';
import { encrypt } from '../lib/encryption.js';

/**
 * Initializes the GitHub OAuth strategy. Must be called after dotenv.config()
 * has loaded environment variables.
 */
export function initializePassport(): void {
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
  const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL!;

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
