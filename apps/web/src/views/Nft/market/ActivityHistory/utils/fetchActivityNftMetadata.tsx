import { Activity, NftToken, TokenIdWithCollectionAddress } from 'state/nftMarket/types'
import { getNftsFromCollectionApi, getNftsFromDifferentCollectionsApi } from 'state/nftMarket/helpers'
import uniqBy from 'lodash/uniqBy'
import partition from 'lodash/partition'
import { Address } from 'wagmi'
import { safeGetAddress } from 'utils'
import { dneroswapBunniesAddress } from '../../constants'

export const fetchActivityNftMetadata = async (activities: Activity[]): Promise<NftToken[]> => {
  const [pbCollections, nonPBCollections] = partition(
    activities,
    (activity) => safeGetAddress(activity.nft.collection.id) === safeGetAddress(dneroswapBunniesAddress),
  )

  const activityNftTokenIds = uniqBy(
    nonPBCollections.map((activity): TokenIdWithCollectionAddress => {
      return { tokenId: activity.nft.tokenId, collectionAddress: activity.nft.collection.id as Address }
    }),
    (tokenWithCollectionAddress) =>
      `${tokenWithCollectionAddress.tokenId}#${tokenWithCollectionAddress.collectionAddress}`,
  )

  const [bunniesMetadata, nfts] = await Promise.all([
    pbCollections.length ? getNftsFromCollectionApi(dneroswapBunniesAddress) : Promise.resolve(null),
    getNftsFromDifferentCollectionsApi(activityNftTokenIds),
  ])

  const pbNfts = bunniesMetadata
    ? pbCollections.map((activity) => {
        const { name: collectionName } = bunniesMetadata.data[activity.nft.otherId].collection
        return {
          ...bunniesMetadata.data[activity.nft.otherId],
          tokenId: activity.nft.tokenId,
          attributes: [{ traitType: 'bunnyId', value: activity.nft.otherId }],
          collectionAddress: activity.nft.collection.id,
          collectionName,
        }
      })
    : []

  return nfts.concat(pbNfts)
}