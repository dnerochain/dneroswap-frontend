import { useCallback, useMemo } from 'react'
import Cookie from 'js-cookie'
import { Token } from '@dneroswap/sdk'
import { ChainId } from '@dneroswap/chains'
import { BigNumber } from 'bignumber.js'
import useActiveWeb3React from 'hooks/useActiveWeb3React'
import { useTranslation } from '@dneroswap/localization'
import { useSwitchNetwork } from 'hooks/useSwitchNetwork'
import useCatchTxError from 'hooks/useCatchTxError'
import { styled } from 'styled-components'
import { TokenPairImage } from 'components/TokenImage'
import {
  Modal,
  InjectedModalProps,
  Flex,
  Box,
  Text,
  Button,
  Message,
  MessageText,
  ArrowForwardIcon,
  AutoRenewIcon,
  useToast,
  FlexGap,
  Balance,
} from '@dneroswap/uikit'
import { ChainLogo } from 'components/Logo/ChainLogo'
import { getBalanceAmount } from '@dneroswap/utils/formatBalance'
import { LightGreyCard } from 'components/Card'
import { ToastDescriptionWithTx } from 'components/Toast'
import { useFarmCProxyAddress } from 'views/Farms/hooks/useFarmCProxyAddress'
import useNonDneroHarvestFarm from 'views/Farms/hooks/useNonDneroHarvestFarm'
import { farmFetcher } from 'state/farms'

const TokenWrapper = styled.div`
  padding-right: 8px;
  width: 32px;

  ${({ theme }) => theme.mediaQueries.sm} {
    width: 40px;
  }
`

interface MultiChainHarvestModalProp extends InjectedModalProps {
  pid: number
  token: Token
  lpSymbol: string
  quoteToken: Token
  earningsBigNumber: BigNumber
  earningsBusd: number
}

const MultiChainHarvestModal: React.FC<MultiChainHarvestModalProp> = ({
  pid,
  token,
  lpSymbol,
  quoteToken,
  earningsBigNumber,
  earningsBusd,
  onDismiss,
}) => {
  const { t } = useTranslation()
  const { toastSuccess } = useToast()
  const { account, chainId, isWrongNetwork } = useActiveWeb3React()
  const { switchNetworkAsync } = useSwitchNetwork()
  const { cProxyAddress } = useFarmCProxyAddress(account, chainId)
  const { onReward } = useNonDneroHarvestFarm(pid, cProxyAddress)
  const { fetchWithCatchTxError, loading: isPending } = useCatchTxError()

  const earnings = getBalanceAmount(earningsBigNumber)
  const displayBalance = earnings.toFixed(5, BigNumber.ROUND_DOWN)

  const isTestnet = farmFetcher.isTestnet(chainId)
  const network = isTestnet ? ChainId.DNERO_TESTNET : ChainId.DNERO
  const isDneroNetwork = useMemo(() => chainId === network, [chainId, network])

  const handleCancel = useCallback(() => {
    onDismiss?.()
  }, [onDismiss])

  const handleSwitchNetwork = () => {
    if (window.ethereum?.isTokenPocket === true) {
      Cookie.set(
        'multiChainHarvestModal',
        JSON.stringify({ pid, token, lpSymbol, quoteToken, earningsBigNumber, earningsBusd }),
      )
    }
    switchNetworkAsync(network)
  }

  const handleHarvest = useCallback(async () => {
    const receipt = await fetchWithCatchTxError(() => onReward())
    if (receipt?.status) {
      toastSuccess(
        `${t('Harvested')}!`,
        <ToastDescriptionWithTx txHash={receipt.transactionHash}>
          {t('Your %symbol% earnings have been sent to your wallet!', { symbol: 'WDNERO' })}
        </ToastDescriptionWithTx>,
      )
      handleCancel()
    }
  }, [t, onReward, fetchWithCatchTxError, toastSuccess, handleCancel])

  return (
    <Modal
      title={isDneroNetwork ? t('Harvest now!') : t('Switch chain to harvest')}
      style={{ maxWidth: '340px' }}
      onDismiss={handleCancel}
    >
      <Flex flexDirection="column">
        <Flex justifyContent="space-between" mb="16px">
          <TokenWrapper>
            <TokenPairImage
              width={40}
              height={40}
              variant="inverted"
              primaryToken={token}
              secondaryToken={quoteToken}
            />
          </TokenWrapper>
          <Text bold fontSize="24px">
            {lpSymbol}
          </Text>
        </Flex>
        {!isDneroNetwork && (
          <Message mb="16px" variant="warning" icon={false} p="8px 12px">
            <MessageText>
              <FlexGap gap="12px">
                <FlexGap gap="6px">
                  <ChainLogo chainId={chainId} /> <ArrowForwardIcon color="#D67E0A" />
                  <ChainLogo chainId={ChainId.DNERO} />
                </FlexGap>
                <span>{t('Harvest on DNEROCHAIN')}</span>
              </FlexGap>
            </MessageText>
          </Message>
        )}
        <LightGreyCard padding="16px">
          <Box mb="8px">
            <Text fontSize="12px" color="secondary" bold as="span">
              {t('WDNERO')}
            </Text>
            <Text fontSize="12px" color="textSubtle" ml="4px" bold as="span">
              {t('Earned')}
            </Text>
          </Box>
          <Box>
            <Text fontSize="20px" lineHeight="110%" bold>
              {displayBalance}
            </Text>
            <Balance
              mb="16px"
              prefix="~"
              unit=" USD"
              decimals={2}
              value={earningsBusd}
              fontSize="12px"
              color="textSubtle"
            />
            {isDneroNetwork ? (
              <Button
                width="100%"
                variant="secondary"
                disabled={isPending || !account || isWrongNetwork}
                endIcon={isPending ? <AutoRenewIcon spin color="currentColor" /> : null}
                onClick={handleHarvest}
              >
                {isPending ? t('Harvesting') : t('Harvest')}
              </Button>
            ) : (
              <Button width="100%" variant="secondary" onClick={handleSwitchNetwork}>
                {t('Switch to DNEROCHAIN')}
              </Button>
            )}
          </Box>
        </LightGreyCard>
      </Flex>
    </Modal>
  )
}

export default MultiChainHarvestModal
