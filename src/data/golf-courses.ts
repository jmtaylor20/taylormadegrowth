/**
 * Courses where the scorecard QR code is printed.
 *
 * Each entry generates its own landing page at /golf/<slug>.html, so every
 * course gets a distinct URL and you can tell which placement is actually
 * producing leads. Adding a fourth course means adding one entry here.
 *
 * `region` is the service area named in the hero copy. Edit it to match how
 * you want to describe your coverage to golfers at that course.
 */
export type GolfCourse = {
  /** URL slug. Becomes /golf/<slug>.html. Keep it short and lowercase. */
  slug: string;
  /** Full course name, used in the form data so leads are labeled clearly. */
  name: string;
  /** Short name for the hero label and page title. */
  short: string;
  /** Service area line in the hero paragraph. */
  region: string;
};

export const golfCourses: GolfCourse[] = [
  {
    slug: 'stillwaters',
    name: 'Stillwaters Golf Course',
    short: 'Stillwaters',
    region: 'around Lake Martin, Dadeville, and East Alabama',
  },
  {
    slug: 'aroostook',
    name: 'Aroostook Golf Course',
    short: 'Aroostook',
    region: 'around Montgomery, Prattville, and Central Alabama',
  },
  {
    slug: 'sylacauga',
    name: 'Sylacauga Country Club',
    short: 'Sylacauga',
    region: 'around Sylacauga, Childersburg, and Central Alabama',
  },
];
