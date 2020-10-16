import { db, admin, firebase } from '../config/firebase';
import Timestamp = admin.firestore.Timestamp;
import { RepoVersionInfo } from './repoVersions';
import FieldValue = admin.firestore.FieldValue;

const COLLECTION = 'ciBuilds';

enum BuildStatus {
  started,
  failed,
  published,
}

type ImageType = 'base' | 'hub' | 'editor';

// Used in Start API
export interface BuildVersionInfo {
  baseOs: string;
  repoVersion: string;
  unityVersion: string;
  targetPlatform: string;
}

// Used in Failure API
export interface BuildFailure {
  reason: string;
}

// Used in Publish API
export interface DockerInfo {
  imageRepo: string;
  imageName: string;
  friendlyTag: string;
  specificTag: string;
  hash: string;
  // date with docker as source of truth?
}

interface MetaData {
  lastBuildStart: Timestamp | null;
  failureCount: number;
  lastBuildFailure: Timestamp | null;
  publishedDate: Timestamp | null;
}

export interface CiBuild {
  jobId: string;
  BuildId: string;
  status: BuildStatus;
  imageType: ImageType;
  meta: MetaData;
  unityVersionInfo: BuildVersionInfo;
  failure: BuildFailure | null;
  dockerInfo: DockerInfo | null;
  addedDate: Timestamp;
  modifiedDate: Timestamp;
}

/**
 * A CI Build represents a single [baseOs-unityVersion-targetPlatform] build.
 * These builds are reported in and run on GitHub Actions.
 * Statuses (failures and publications) are also reported back on this level.
 */
export class CiBuilds {
  static getAll = async (): Promise<CiBuild[]> => {
    const snapshot = await db.collection(COLLECTION).get();

    return snapshot.docs.map((doc) => doc.data()) as CiBuild[];
  };

  static create = async (
    jobId: string,
    imageType: ImageType,
    buildVersionInfo: BuildVersionInfo,
    repoVersionInfo: RepoVersionInfo,
  ) => {
    try {
      await db
        .collection(COLLECTION)
        .doc('some elaborate id')
        .set({
          jobId,
          imageType,
          status: BuildStatus.started,
          buildVersionInfo,
          failure: null,
          meta: {
            lastBuildStart: Timestamp.now(),
            failureCount: 0,
            lastBuildFailure: null,
          },
          addedDate: Timestamp.now(),
          modifiedDate: Timestamp.now(),
        });
    } catch (err) {
      firebase.logger.error('Error occurred while trying to enqueue a new build', err);
    }
  };

  static markBuildAsFailed = async (buildId: string, failure: BuildFailure) => {
    const build = await db.collection(COLLECTION).doc(buildId);

    await build.update({
      status: BuildStatus.failed,
      failure,
      modifiedDate: Timestamp.now(),
      'meta.failureCount': FieldValue.increment(1),
      'meta.lastBuildFailure': Timestamp.now(),
    });
  };

  static markBuildAsPublished = async (buildId: string, dockerInfo: DockerInfo) => {
    const build = await db.collection(COLLECTION).doc(buildId);

    await build.update({
      status: BuildStatus.published,
      dockerInfo,
      modifiedDate: Timestamp.now(),
      'meta.publishedDate': Timestamp.now(),
    });
  };
}
